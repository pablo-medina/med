import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  baseKeymap,
  chainCommands,
  deleteSelection,
  newlineInCode,
  selectAll,
  setBlockType,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import {
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { DOMParser as ProseMirrorDOMParser, Fragment } from "prosemirror-model";
import {
  EditorState,
  Selection,
  TextSelection,
  type Command,
} from "prosemirror-state";
import {
  liftListItem,
  sinkListItem,
} from "prosemirror-schema-list";
import { EditorView } from "prosemirror-view";
import { goToNextCell, tableEditing } from "prosemirror-tables";
import { ContextMenu, type ContextMenuItem } from "../components/ContextMenu";
import { pageDimensionsMm, type PageLayout } from "../document/pageLayout";
import { useI18n } from "../i18n";
import {
  insertBlock,
  insertMarkdownHardBreak,
  insertParagraphOrContinueList,
  toggleList,
  type InsertableBlockKind,
} from "./commands";
import { markdownSchema, parseMarkdown, serializeMarkdown } from "./markdown";

export type BlockKind = "paragraph" | "heading1" | "heading2" | "heading3" | "code";

export interface EditorSelectionState {
  block: BlockKind;
  bold: boolean;
  italic: boolean;
  link: boolean;
  bulletList: boolean;
  orderedList: boolean;
}

export interface RichEditorHandle {
  focus: () => void;
  toggleBold: () => boolean;
  toggleItalic: () => boolean;
  setBlock: (block: BlockKind) => boolean;
  insertBlock: (block: InsertableBlockKind) => boolean;
  toggleBulletList: () => boolean;
  toggleOrderedList: () => boolean;
  toggleBlockquote: () => boolean;
  indentList: () => boolean;
  outdentList: () => boolean;
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
  const hasAncestor = (type: typeof markdownSchema.nodes.bullet_list) => {
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type === type) return true;
    }
    return false;
  };
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
    bulletList: hasAncestor(markdownSchema.nodes.bullet_list),
    orderedList: hasAncestor(markdownSchema.nodes.ordered_list),
  };
}

function editorInputRules() {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, markdownSchema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
      textblockTypeInputRule(/^```$/, markdownSchema.nodes.code_block),
      wrappingInputRule(
        /^\s*([-+*])\s$/,
        markdownSchema.nodes.bullet_list,
        { tight: true },
      ),
      wrappingInputRule(/^(\d+)[.)]\s$/, markdownSchema.nodes.ordered_list, (match) => ({
        order: Number(match[1]),
        tight: true,
      }), (match, node) => node.childCount + node.attrs.order === Number(match[1])),
      wrappingInputRule(/^>\s$/, markdownSchema.nodes.blockquote),
    ],
  });
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor({ value, label, onChange, onSelectionChange, pagination }, ref) {
    const { t } = useI18n();
    const mountRef = useRef<HTMLDivElement>(null);
    const paginationStyleRef = useRef<HTMLStyleElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const currentMarkdownRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const paginationRef = useRef(pagination);
    const paginationFrameRef = useRef<number | null>(null);
    const paginationSpacersRef = useRef<number[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;
    paginationRef.current = pagination;

    const run = useCallback((command: Command) => {
      const view = viewRef.current;
      if (!view) return false;
      const handled = command(view.state, view.dispatch, view);
      if (handled) view.focus();
      return handled;
    }, []);

    const closeContextMenu = useCallback((restoreFocus = false) => {
      setContextMenu(null);
      if (restoreFocus) requestAnimationFrame(() => viewRef.current?.focus());
    }, []);

    const openContextMenu = useCallback((x: number, y: number) => {
      const menuWidth = 286;
      const menuHeight = 520;
      setContextMenu({
        x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
        y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
      });
    }, []);

    const copySelection = useCallback(async (cut: boolean) => {
      const view = viewRef.current;
      if (!view || view.state.selection.empty) return;
      const { from, to } = view.state.selection;
      const text = view.state.doc.textBetween(from, to, "\n");
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        view.focus();
        copied = document.execCommand("copy");
      }
      if (cut && copied) run(deleteSelection);
    }, [run]);

    const pasteClipboard = useCallback(async () => {
      const view = viewRef.current;
      if (!view || !navigator.clipboard?.readText) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        const slice = parseMarkdown(text).slice(0);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        view.focus();
      } catch {
        view.focus();
      }
    }, []);

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
            Enter: insertParagraphOrContinueList,
            "Shift-Enter": chainCommands(newlineInCode, insertMarkdownHardBreak),
            Tab: chainCommands(
              goToNextCell(1),
              sinkListItem(markdownSchema.nodes.list_item),
            ),
            "Shift-Tab": chainCommands(
              goToNextCell(-1),
              liftListItem(markdownSchema.nodes.list_item),
            ),
            "Mod-]": sinkListItem(markdownSchema.nodes.list_item),
            "Mod-[": liftListItem(markdownSchema.nodes.list_item),
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
          if (transaction.selectionSet || transaction.docChanged) setContextMenu(null);
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
        handleDOMEvents: {
          contextmenu(view, event) {
            event.preventDefault();
            const mouseEvent = event as MouseEvent;
            const target = view.posAtCoords({ left: mouseEvent.clientX, top: mouseEvent.clientY });
            if (target) {
              const { from, to } = view.state.selection;
              if (target.pos < from || target.pos > to) {
                view.dispatch(
                  view.state.tr.setSelection(
                    Selection.near(view.state.doc.resolve(target.pos)),
                  ),
                );
              }
            }
            view.focus();
            openContextMenu(mouseEvent.clientX, mouseEvent.clientY);
            return true;
          },
        },
        handleKeyDown(view, event) {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
            return false;
          }
          event.preventDefault();
          const coordinates = view.coordsAtPos(view.state.selection.head);
          openContextMenu(coordinates.left, coordinates.bottom + 4);
          return true;
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
        insertBlock: (block) => run(insertBlock(block)),
        toggleBulletList: () => run(toggleList(markdownSchema.nodes.bullet_list)),
        toggleOrderedList: () => run(toggleList(markdownSchema.nodes.ordered_list)),
        toggleBlockquote: () => run(wrapIn(markdownSchema.nodes.blockquote)),
        indentList: () => run(sinkListItem(markdownSchema.nodes.list_item)),
        outdentList: () => run(liftListItem(markdownSchema.nodes.list_item)),
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
    }, [run]);

    const view = viewRef.current;
    const currentSelection = view ? selectionState(view) : null;
    const commandAvailable = (command: Command) => Boolean(view && command(view.state));
    const contextMenuItems: ContextMenuItem[] = [
      { label: t("menu.edit.undo"), shortcut: "Ctrl+Z", icon: "undo", action: () => run(undo), disabled: !commandAvailable(undo) },
      { label: t("menu.edit.redo"), shortcut: "Ctrl+Y", icon: "redo", action: () => run(redo), disabled: !commandAvailable(redo) },
      { separator: true },
      { label: t("menu.edit.cut"), shortcut: "Ctrl+X", action: () => copySelection(true), disabled: !view || view.state.selection.empty },
      { label: t("menu.edit.copy"), shortcut: "Ctrl+C", action: () => copySelection(false), disabled: !view || view.state.selection.empty },
      { label: t("menu.edit.paste"), shortcut: "Ctrl+V", action: pasteClipboard, disabled: !navigator.clipboard?.readText },
      { label: t("menu.edit.selectAll"), shortcut: "Ctrl+A", action: () => run(selectAll) },
      { separator: true },
      { label: t("editor.bold"), shortcut: "Ctrl+B", icon: "bold", selected: currentSelection?.bold, action: () => run(toggleMark(markdownSchema.marks.strong)) },
      { label: t("editor.italic"), shortcut: "Ctrl+I", icon: "italic", selected: currentSelection?.italic, action: () => run(toggleMark(markdownSchema.marks.em)) },
      { separator: true },
      { label: t("editor.bulletedList"), icon: "bulletList", selected: currentSelection?.bulletList, action: () => run(toggleList(markdownSchema.nodes.bullet_list)) },
      { label: t("editor.numberedList"), icon: "numberedList", selected: currentSelection?.orderedList, action: () => run(toggleList(markdownSchema.nodes.ordered_list)) },
      { label: t("editor.indentList"), shortcut: "Tab", action: () => run(sinkListItem(markdownSchema.nodes.list_item)), disabled: !commandAvailable(sinkListItem(markdownSchema.nodes.list_item)) },
      { label: t("editor.outdentList"), shortcut: "Shift+Tab", action: () => run(liftListItem(markdownSchema.nodes.list_item)), disabled: !commandAvailable(liftListItem(markdownSchema.nodes.list_item)) },
      { separator: true },
      { label: t("editor.codeBlock"), icon: "code", action: () => run(insertBlock("code")) },
      { label: t("editor.blockquote"), icon: "quote", action: () => run(insertBlock("blockquote")) },
      { label: t("editor.horizontalRule"), action: () => run(insertBlock("horizontalRule")) },
    ];

    return (
      <>
        <style ref={paginationStyleRef} />
        <div className="rich-editor" ref={mountRef} />
        {contextMenu && (
          <ContextMenu
            label={t("editor.contextMenu")}
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenuItems}
            onClose={closeContextMenu}
          />
        )}
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
