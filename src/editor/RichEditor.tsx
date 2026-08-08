import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { baseKeymap, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import {
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { DOMParser as ProseMirrorDOMParser, Fragment } from "prosemirror-model";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { goToNextCell, tableEditing } from "prosemirror-tables";
import { insertMarkdownLineBreak } from "./commands";
import { markdownSchema, parseMarkdown, serializeMarkdown } from "./markdown";

export type BlockKind = "paragraph" | "heading1" | "heading2" | "heading3" | "code";

export interface EditorSelectionState {
  block: BlockKind;
  bold: boolean;
  italic: boolean;
  link: boolean;
}

export interface RichEditorHandle {
  focus: () => void;
  toggleBold: () => boolean;
  toggleItalic: () => boolean;
  setBlock: (block: BlockKind) => boolean;
  toggleBulletList: () => boolean;
  toggleOrderedList: () => boolean;
  toggleBlockquote: () => boolean;
  insertTable: (rows: number, columns: number) => boolean;
  setLink: (href: string) => boolean;
  undo: () => boolean;
  redo: () => boolean;
}

interface RichEditorProps {
  value: string;
  label: string;
  onChange: (markdown: string) => void;
  onSelectionChange?: (state: EditorSelectionState) => void;
}

function selectionState(view: EditorView): EditorSelectionState {
  const { from, to, $from } = view.state.selection;
  const hasMark = (name: "strong" | "em" | "link") => {
    const mark = markdownSchema.marks[name];
    if (from === to) {
      return Boolean(mark.isInSet(view.state.storedMarks ?? $from.marks()));
    }
    return view.state.doc.rangeHasMark(from, to, mark);
  };

  const parent = $from.parent;
  let block: BlockKind = "paragraph";
  if (parent.type === markdownSchema.nodes.heading) {
    block = `heading${Math.min(parent.attrs.level, 3)}` as BlockKind;
  } else if (parent.type === markdownSchema.nodes.code_block) {
    block = "code";
  }

  return {
    block,
    bold: hasMark("strong"),
    italic: hasMark("em"),
    link: hasMark("link"),
  };
}

function editorInputRules() {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, markdownSchema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
      textblockTypeInputRule(/^```$/, markdownSchema.nodes.code_block),
      wrappingInputRule(/^\s*([-+*])\s$/, markdownSchema.nodes.bullet_list),
      wrappingInputRule(/^(\d+)\.\s$/, markdownSchema.nodes.ordered_list, (match) => ({
        order: Number(match[1]),
      })),
      wrappingInputRule(/^>\s$/, markdownSchema.nodes.blockquote),
    ],
  });
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor({ value, label, onChange, onSelectionChange }, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const currentMarkdownRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const onSelectionChangeRef = useRef(onSelectionChange);

    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;

    useEffect(() => {
      if (!mountRef.current) return;

      const state = EditorState.create({
        schema: markdownSchema,
        doc: parseMarkdown(value),
        plugins: [
          history(),
          editorInputRules(),
          keymap({
            Enter: insertMarkdownLineBreak,
            Tab: goToNextCell(1),
            "Shift-Tab": goToNextCell(-1),
            "Mod-b": toggleMark(markdownSchema.marks.strong),
            "Mod-i": toggleMark(markdownSchema.marks.em),
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-Shift-z": redo,
          }),
          keymap(baseKeymap),
          tableEditing(),
        ],
      });

      const view = new EditorView(mountRef.current, {
        state,
        dispatchTransaction(transaction) {
          const nextState = view.state.apply(transaction);
          view.updateState(nextState);
          onSelectionChangeRef.current?.(selectionState(view));
          if (transaction.docChanged) {
            const markdown = serializeMarkdown(nextState.doc);
            currentMarkdownRef.current = markdown;
            onChangeRef.current(markdown);
          }
        },
        attributes: {
          class: "med-document",
          "aria-label": label,
          spellcheck: "true",
        },
      });

      viewRef.current = view;
      onSelectionChangeRef.current?.(selectionState(view));
      requestAnimationFrame(() => {
        if (viewRef.current === view) view.focus();
      });
      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, [label]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || value === currentMarkdownRef.current) return;
      const nextDocument = parseMarkdown(value);
      const nextState = EditorState.create({
        schema: markdownSchema,
        doc: nextDocument,
        plugins: view.state.plugins,
      });
      currentMarkdownRef.current = value;
      view.updateState(nextState);
      onSelectionChangeRef.current?.(selectionState(view));
    }, [value]);

    useImperativeHandle(ref, () => {
      const run = (command: Command) => {
        const view = viewRef.current;
        if (!view) return false;
        const handled = command(view.state, view.dispatch, view);
        if (handled) view.focus();
        return handled;
      };

      return {
        focus: () => viewRef.current?.focus(),
        toggleBold: () => run(toggleMark(markdownSchema.marks.strong)),
        toggleItalic: () => run(toggleMark(markdownSchema.marks.em)),
        setBlock: (block) => {
          if (block === "paragraph") return run(setBlockType(markdownSchema.nodes.paragraph));
          if (block === "code") return run(setBlockType(markdownSchema.nodes.code_block));
          const level = Number(block[block.length - 1]);
          return run(setBlockType(markdownSchema.nodes.heading, { level }));
        },
        toggleBulletList: () => run(wrapIn(markdownSchema.nodes.bullet_list)),
        toggleOrderedList: () => run(wrapIn(markdownSchema.nodes.ordered_list)),
        toggleBlockquote: () => run(wrapIn(markdownSchema.nodes.blockquote)),
        insertTable: (rows, columns) => {
          const view = viewRef.current;
          if (!view || rows < 1 || columns < 1) return false;
          const { state } = view;
          const makeCell = (type: "table_header" | "table_cell") =>
            markdownSchema.nodes[type].createAndFill()!;
          const table = markdownSchema.nodes.table.create(
            null,
            Fragment.fromArray(
              Array.from({ length: rows }, (_, rowIndex) =>
                markdownSchema.nodes.table_row.create(
                  null,
                  Fragment.fromArray(
                    Array.from({ length: columns }, () =>
                      makeCell(rowIndex === 0 ? "table_header" : "table_cell"),
                    ),
                  ),
                ),
              ),
            ),
          );
          const insertAt = state.selection.from;
          const transaction = state.tr.replaceSelectionWith(table);
          transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertAt + 4)));
          view.dispatch(transaction.scrollIntoView());
          view.focus();
          return true;
        },
        setLink: (href) => run(toggleMark(markdownSchema.marks.link, { href })),
        undo: () => run(undo),
        redo: () => run(redo),
      };
    }, []);

    return <div className="rich-editor" ref={mountRef} />;
  },
);

export function htmlToMarkdown(html: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const documentNode = ProseMirrorDOMParser.fromSchema(markdownSchema).parse(wrapper);
  return serializeMarkdown(documentNode);
}
