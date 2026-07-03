import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { basicSetup } from "codemirror";
import { redo, undo } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export interface MarkdownEditorHandle {
  focus: () => void;
  getSelection: () => { start: number; end: number };
  setSelection: (start: number, end?: number) => void;
  selectAll: () => void;
  undo: () => void;
  redo: () => void;
  refreshLayout: () => void;
  runClipboardCommand: (command: "cut" | "copy" | "paste") => void;
}

interface MarkdownEditorProps {
  value: string;
  ariaLabel: string;
  fontSize: number;
  wordWrap: boolean;
  onChange: (value: string) => void;
  onCursorChange: (line: number, column: number) => void;
  onContextMenu: (x: number, y: number) => void;
}

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--syntax-heading)", fontWeight: "700" },
  { tag: tags.strong, color: "var(--syntax-strong)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--syntax-emphasis)", fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "var(--syntax-link)", textDecoration: "underline" },
  { tag: tags.monospace, color: "var(--syntax-code)" },
  { tag: tags.quote, color: "var(--syntax-quote)" },
  { tag: [tags.meta, tags.processingInstruction], color: "var(--syntax-meta)" },
]);

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  value,
  ariaLabel,
  fontSize,
  wordWrap,
  onChange,
  onCursorChange,
  onContextMenu,
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onContextMenuRef = useRef(onContextMenu);
  const wrapping = useMemo(() => new Compartment(), []);
  const appearance = useMemo(() => new Compartment(), []);

  onChangeRef.current = onChange;
  onCursorChangeRef.current = onCursorChange;
  onContextMenuRef.current = onContextMenu;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          syntaxHighlighting(markdownHighlightStyle),
          wrapping.of(wordWrap ? EditorView.lineWrapping : []),
          appearance.of(EditorView.theme({ "&": { fontSize: `${fontSize}px` } })),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: "true" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) {
              const position = update.state.selection.main.head;
              const line = update.state.doc.lineAt(position);
              onCursorChangeRef.current(line.number, position - line.from + 1);
            }
          }),
          EditorView.domEventHandlers({
            contextmenu(event) {
              event.preventDefault();
              onContextMenuRef.current(event.clientX, event.clientY);
              return true;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    const resizeObserver = new ResizeObserver(() => view.requestMeasure());
    resizeObserver.observe(hostRef.current);
    const frame = requestAnimationFrame(() => view.requestMeasure());
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        wrapping.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        appearance.reconfigure(EditorView.theme({ "&": { fontSize: `${fontSize}px` } })),
      ],
    });
  }, [appearance, fontSize, wordWrap, wrapping]);

  useEffect(() => {
    viewRef.current?.contentDOM.setAttribute("aria-label", ariaLabel);
  }, [ariaLabel]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    getSelection: () => {
      const selection = viewRef.current?.state.selection.main;
      return selection ? { start: selection.from, end: selection.to } : { start: 0, end: 0 };
    },
    setSelection: (start, end = start) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true });
    },
    selectAll: () => {
      const view = viewRef.current;
      if (!view) return;
      view.focus();
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    },
    undo: () => { if (viewRef.current) undo(viewRef.current); },
    redo: () => { if (viewRef.current) redo(viewRef.current); },
    refreshLayout: () => viewRef.current?.requestMeasure(),
    runClipboardCommand: (command) => {
      viewRef.current?.focus();
      document.execCommand(command);
    },
  }), []);

  return <div ref={hostRef} className="markdown-editor" />;
});
