import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema,
} from "prosemirror-markdown";
import type { Node as ProseMirrorNode } from "prosemirror-model";

export const markdownSchema = schema;

// MED treats a single source newline as a visible line break. This keeps the
// source representation aligned with what users expect when pressing Enter in
// the visual editor, while blank lines remain paragraph separators.
const medMarkdownParser = new MarkdownParser(
  schema,
  defaultMarkdownParser.tokenizer,
  {
    ...defaultMarkdownParser.tokens,
    softbreak: { node: "hard_break" },
  },
);

const medMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
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
