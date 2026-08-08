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
import { pageDimensionsMm, type PageLayout } from "../document/pageLayout";
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
  pagination?: {
    layout: PageLayout;
    onPageCountChange: (count: number) => void;
  };
}

const millimetersToPixels = 96 / 25.4;
const pageGapPixels = 24;

function clearPagination(
  documentElement: HTMLElement,
  paginationStyle: HTMLStyleElement | null,
) {
  documentElement.classList.remove("med-document--paginated");
  if (paginationStyle) paginationStyle.textContent = "";
}

function paginateDocument(
  documentElement: HTMLElement,
  layout: PageLayout,
  currentSpacers: number[],
): { pageCount: number; spacers: number[]; css: string } {
  documentElement.classList.add("med-document--paginated");
  const dimensions = pageDimensionsMm(layout);
  const pageHeight = dimensions.height * millimetersToPixels;
  const contentHeight = (dimensions.height - layout.margins.top - layout.margins.bottom)
    * millimetersToPixels;
  const topMargin = layout.margins.top * millimetersToPixels;
  const bottomMargin = layout.margins.bottom * millimetersToPixels;
  const pagePitch = pageHeight + pageGapPixels;
  const children = Array.from(documentElement.children) as HTMLElement[];

  const desiredSpacers: number[] = [];
  const unpaginatedGaps: number[] = [];
  let currentCumulativeSpacer = 0;
  let desiredCumulativeSpacer = 0;
  let previousUnpaginatedBottom = topMargin;
  let lastBottom = topMargin;
  children.forEach((child, childIndex) => {
    const currentSpacer = currentSpacers[childIndex] ?? 0;
    currentCumulativeSpacer += currentSpacer;

    const unpaginatedTop = child.offsetTop - currentCumulativeSpacer;
    const unpaginatedGap = Math.max(0, unpaginatedTop - previousUnpaginatedBottom);
    unpaginatedGaps.push(unpaginatedGap);
    let top = unpaginatedTop + desiredCumulativeSpacer;
    const height = child.offsetHeight;
    let pageIndex = Math.max(0, Math.floor(top / pagePitch));
    let contentTop = pageIndex * pagePitch + topMargin;
    const contentBottom = contentTop + contentHeight;
    let spacer = 0;

    if (top < contentTop - 0.5) {
      spacer = contentTop - top;
    } else if (top + height > contentBottom + 0.5 && height <= contentHeight) {
      pageIndex += 1;
      contentTop = pageIndex * pagePitch + topMargin;
      spacer = contentTop - top;
    }

    if (spacer > 0.5) {
      top += spacer;
    }
    desiredSpacers.push(spacer);
    desiredCumulativeSpacer += spacer;
    lastBottom = Math.max(lastBottom, top + height);
    previousUnpaginatedBottom = unpaginatedTop + height;
  });

  let pageCount = Math.max(1, Math.floor(lastBottom / pagePitch) + 1);
  const finalPageTop = (pageCount - 1) * pagePitch;
  if (lastBottom + bottomMargin > finalPageTop + pageHeight + 0.5) pageCount += 1;
  const css = desiredSpacers
    .map((spacer, index) => spacer > 0.5
      ? `.med-document--paginated > :nth-child(${index + 1}) { margin-top: ${spacer + unpaginatedGaps[index]}px !important; }`
      : "")
    .filter(Boolean)
    .join("\n");
  return { pageCount, spacers: desiredSpacers, css };
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
  function RichEditor({ value, label, onChange, onSelectionChange, pagination }, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const paginationStyleRef = useRef<HTMLStyleElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const currentMarkdownRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const paginationRef = useRef(pagination);
    const paginationFrameRef = useRef<number | null>(null);
    const paginationSpacersRef = useRef<number[]>([]);

    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;
    paginationRef.current = pagination;

    const schedulePagination = () => {
      if (paginationFrameRef.current !== null) cancelAnimationFrame(paginationFrameRef.current);
      paginationFrameRef.current = requestAnimationFrame(() => {
        paginationFrameRef.current = null;
        const view = viewRef.current;
        const current = paginationRef.current;
        if (!view) return;
        if (!current) {
          paginationSpacersRef.current = [];
          clearPagination(view.dom, paginationStyleRef.current);
          return;
        }
        const result = paginateDocument(
          view.dom,
          current.layout,
          paginationSpacersRef.current,
        );
        paginationSpacersRef.current = result.spacers;
        if (paginationStyleRef.current?.textContent !== result.css) {
          paginationStyleRef.current!.textContent = result.css;
        }
        current.onPageCountChange(result.pageCount);
      });
    };

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
            schedulePagination();
          }
        },
        attributes: {
          class: "med-document",
          "aria-label": label,
          spellcheck: "true",
        },
      });

      viewRef.current = view;
      const resizeObserver = new ResizeObserver(schedulePagination);
      resizeObserver.observe(view.dom);
      onSelectionChangeRef.current?.(selectionState(view));
      schedulePagination();
      requestAnimationFrame(() => {
        if (viewRef.current === view) view.focus();
      });
      return () => {
        resizeObserver.disconnect();
        if (paginationFrameRef.current !== null) {
          cancelAnimationFrame(paginationFrameRef.current);
          paginationFrameRef.current = null;
        }
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
      schedulePagination();
    }, [value]);

    useEffect(() => {
      schedulePagination();
    }, [pagination?.layout, Boolean(pagination)]);

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

    return (
      <>
        <style ref={paginationStyleRef} />
        <div className="rich-editor" ref={mountRef} />
      </>
    );
  },
);

export function htmlToMarkdown(html: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const documentNode = ProseMirrorDOMParser.fromSchema(markdownSchema).parse(wrapper);
  return serializeMarkdown(documentNode);
}
