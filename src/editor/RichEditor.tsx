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
import { DOMParser as ProseMirrorDOMParser } from "prosemirror-model";
import { schema } from "prosemirror-markdown";
import { EditorState, type Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { insertMarkdownLineBreak } from "./commands";
import { parseMarkdown, serializeMarkdown } from "./markdown";

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
    const mark = schema.marks[name];
    if (from === to) {
      return Boolean(mark.isInSet(view.state.storedMarks ?? $from.marks()));
    }
    return view.state.doc.rangeHasMark(from, to, mark);
  };

  const parent = $from.parent;
  let block: BlockKind = "paragraph";
  if (parent.type === schema.nodes.heading) {
    block = `heading${Math.min(parent.attrs.level, 3)}` as BlockKind;
  } else if (parent.type === schema.nodes.code_block) {
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
      textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
      textblockTypeInputRule(/^```$/, schema.nodes.code_block),
      wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
      wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (match) => ({
        order: Number(match[1]),
      })),
      wrappingInputRule(/^>\s$/, schema.nodes.blockquote),
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
        schema,
        doc: parseMarkdown(value),
        plugins: [
          history(),
          editorInputRules(),
          keymap({
            Enter: insertMarkdownLineBreak,
            "Mod-b": toggleMark(schema.marks.strong),
            "Mod-i": toggleMark(schema.marks.em),
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-Shift-z": redo,
          }),
          keymap(baseKeymap),
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
        schema,
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
        toggleBold: () => run(toggleMark(schema.marks.strong)),
        toggleItalic: () => run(toggleMark(schema.marks.em)),
        setBlock: (block) => {
          if (block === "paragraph") return run(setBlockType(schema.nodes.paragraph));
          if (block === "code") return run(setBlockType(schema.nodes.code_block));
          const level = Number(block[block.length - 1]);
          return run(setBlockType(schema.nodes.heading, { level }));
        },
        toggleBulletList: () => run(wrapIn(schema.nodes.bullet_list)),
        toggleOrderedList: () => run(wrapIn(schema.nodes.ordered_list)),
        toggleBlockquote: () => run(wrapIn(schema.nodes.blockquote)),
        setLink: (href) => run(toggleMark(schema.marks.link, { href })),
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
  const documentNode = ProseMirrorDOMParser.fromSchema(schema).parse(wrapper);
  return serializeMarkdown(documentNode);
}
