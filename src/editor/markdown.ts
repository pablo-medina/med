import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema,
} from "prosemirror-markdown";
import { Schema, type Node as ProseMirrorNode, type NodeType } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

export const markdownSchema = new Schema({
  nodes: schema.spec.nodes.append(
    tableNodes({
      tableGroup: "block",
      cellContent: "block+",
      cellAttributes: {
        align: {
          default: null,
          getFromDOM: (element) => element.style.textAlign || null,
          setDOMAttr: (value, attributes) => {
            if (value) attributes.style = `text-align:${value}`;
          },
        },
      },
    }),
  ),
  marks: schema.spec.marks,
});

function tableAlignment(token: { attrGet: (name: string) => string | null }) {
  const alignment = token.attrGet("style")?.match(/text-align:(left|center|right)/)?.[1];
  return { align: alignment ?? null };
}

interface TableParseState {
  openNode: (type: NodeType, attrs?: Record<string, unknown>) => void;
  closeNode: () => void;
}

// MED treats a single source newline as a visible line break. This keeps the
// source representation aligned with what users expect when pressing Enter in
// the visual editor, while blank lines remain paragraph separators.
const medMarkdownParser = new MarkdownParser(
  markdownSchema,
  defaultMarkdownParser.tokenizer.enable("table"),
  {
    ...defaultMarkdownParser.tokens,
    softbreak: { node: "hard_break" },
    table: { block: "table" },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: "table_row" },
    th: { block: "table_header", getAttrs: tableAlignment },
    td: { block: "table_cell", getAttrs: tableAlignment },
  },
);

const tableTokenHandlers = (medMarkdownParser as unknown as {
  tokenHandlers: Record<string, (state: TableParseState, token: { attrGet: (name: string) => string | null }) => void>;
}).tokenHandlers;

function openTableCell(type: "table_header" | "table_cell") {
  return (state: TableParseState, token: { attrGet: (name: string) => string | null }) => {
    state.openNode(markdownSchema.nodes[type], tableAlignment(token));
    state.openNode(markdownSchema.nodes.paragraph);
  };
}

function closeTableCell(state: TableParseState) {
  state.closeNode();
  state.closeNode();
}

tableTokenHandlers.th_open = openTableCell("table_header");
tableTokenHandlers.th_close = closeTableCell;
tableTokenHandlers.td_open = openTableCell("table_cell");
tableTokenHandlers.td_close = closeTableCell;

function tableCellMarkdown(cell: ProseMirrorNode) {
  const document = markdownSchema.node("doc", null, cell.content);
  return serializeMarkdown(document)
    .trimEnd()
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>");
}

const medMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    bullet_list(state, node, parent, index) {
      const tightNode = node.type.create({ ...node.attrs, tight: true }, node.content);
      defaultMarkdownSerializer.nodes.bullet_list(state, tightNode, parent, index);
    },
    ordered_list(state, node, parent, index) {
      const tightNode = node.type.create({ ...node.attrs, tight: true }, node.content);
      defaultMarkdownSerializer.nodes.ordered_list(state, tightNode, parent, index);
    },
    table(state, node) {
      const rows = Array.from({ length: node.childCount }, (_, rowIndex) => node.child(rowIndex));
      const columns = Math.max(...rows.map((row) => row.childCount));
      const header = rows[0];
      const alignments = Array.from({ length: columns }, (_, columnIndex) => {
        const alignment = columnIndex < header.childCount ? header.child(columnIndex).attrs.align : null;
        return alignment === "left" ? ":---" : alignment === "center" ? ":---:" : alignment === "right" ? "---:" : "---";
      });
      const renderRow = (row: ProseMirrorNode) => {
        const cells = Array.from({ length: columns }, (_, columnIndex) =>
          columnIndex < row.childCount ? tableCellMarkdown(row.child(columnIndex)) : "",
        );
        return `| ${cells.join(" | ")} |`;
      };

      const lines = [
        renderRow(header),
        `| ${alignments.join(" | ")} |`,
        ...rows.slice(1).map(renderRow),
      ];
      lines.forEach((line, index) => state.write(line + (index + 1 < lines.length ? "\n" : "")));
      state.closeBlock(node);
    },
    table_row() {},
    table_cell() {},
    table_header() {},
    text(state, node, parent, index) {
      const beginsVisualLine = index === 0
        || parent.child(index - 1).type === markdownSchema.nodes.hard_break;
      const inAutolink = (state as unknown as { inAutolink?: boolean }).inAutolink;
      if (inAutolink) {
        state.text(node.text ?? "", false);
      } else if (beginsVisualLine) {
        state.write(state.esc(node.text ?? "", true));
      } else {
        state.text(node.text ?? "");
      }
    },
    hard_break(state, node, parent, index) {
      // Do not serialize trailing breaks. Markdown cannot preserve them
      // reliably, and this matches the default serializer's behavior.
      for (let nextIndex = index + 1; nextIndex < parent.childCount; nextIndex += 1) {
        if (parent.child(nextIndex).type !== node.type) {
          state.write("\n");
          return;
        }
      }
    },
  },
  defaultMarkdownSerializer.marks,
);

export function parseMarkdown(markdown: string): ProseMirrorNode {
  const normalizedLineEndings = markdown.replace(/\r\n?/g, "\n");
  return medMarkdownParser.parse(normalizedLineEndings);
}

export function serializeMarkdown(document: ProseMirrorNode): string {
  return medMarkdownSerializer.serialize(document, {
    tightLists: true,
  });
}

/**
 * Produces MED's canonical Markdown representation. The operation is
 * intentionally idempotent: canonicalizing the result again is a no-op.
 */
export function canonicalizeMarkdown(markdown: string): string {
  return serializeMarkdown(parseMarkdown(markdown));
}
