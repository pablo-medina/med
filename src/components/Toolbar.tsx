import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Translate } from "../i18n";
import type {
  BlockKind,
  EditorSelectionState,
  RichEditorHandle,
} from "../editor/RichEditor";
import type { InsertableBlockKind } from "../editor/commands";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import { useManagedSurface } from "./WindowManager";

type WorkspaceMode = "document" | "web" | "source";

interface ToolbarProps {
  t: Translate;
  editorRef: RefObject<RichEditorHandle | null>;
  selection: EditorSelectionState;
  mode: WorkspaceMode;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLink: () => void;
  onPageSetup: () => void;
  onModeChange: (mode: WorkspaceMode) => void;
}

const TABLE_PICKER_COLUMNS = 10;
const TABLE_PICKER_ROWS = 8;

function TablePicker({
  label,
  disabled,
  onInsert,
}: {
  label: string;
  disabled: boolean;
  onInsert: (rows: number, columns: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState({ rows: 1, columns: 1 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceId = useId();
  useManagedSurface(
    {
      id: `table-picker-${surfaceId}`,
      kind: "popover",
      ownerId: "main",
      closePolicy: "outside-or-escape",
    },
    open,
  );

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="table-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="table" />
      </button>
      {open && (
        <div
          className="table-picker__popover"
          role="dialog"
          aria-label={label}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="table-picker__grid" role="grid" aria-label={label}>
            {Array.from({ length: TABLE_PICKER_ROWS }, (_, rowIndex) =>
              Array.from({ length: TABLE_PICKER_COLUMNS }, (_, columnIndex) => {
                const rows = rowIndex + 1;
                const columns = columnIndex + 1;
                return (
                  <button
                    type="button"
                    role="gridcell"
                    key={`${rows}-${columns}`}
                    className={
                      rows <= size.rows && columns <= size.columns
                        ? "table-picker__cell is-selected"
                        : "table-picker__cell"
                    }
                    aria-label={`${label}: ${columns} × ${rows}`}
                    onMouseEnter={() => setSize({ rows, columns })}
                    onFocus={() => setSize({ rows, columns })}
                    onClick={() => {
                      onInsert(rows, columns);
                      setOpen(false);
                    }}
                  />
                );
              }),
            )}
          </div>
          <div className="table-picker__size" aria-live="polite">
            {size.columns} × {size.rows} {label.toLocaleLowerCase()}
          </div>
        </div>
      )}
    </div>
  );
}

function BlockPicker({
  t,
  disabled,
  onInsert,
}: {
  t: Translate;
  disabled: boolean;
  onInsert: (block: InsertableBlockKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceId = useId();
  useManagedSurface({
    id: `block-picker-${surfaceId}`,
    kind: "popover",
    ownerId: "main",
    closePolicy: "outside-or-escape",
  }, open);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const blocks: Array<{
    kind: InsertableBlockKind;
    label: string;
    icon: "document" | "code" | "quote";
    badge?: string;
  }> = [
    { kind: "paragraph", label: t("editor.heading.normal"), icon: "document" },
    { kind: "heading1", label: t("editor.heading.level1"), icon: "document", badge: "H1" },
    { kind: "heading2", label: t("editor.heading.level2"), icon: "document", badge: "H2" },
    { kind: "heading3", label: t("editor.heading.level3"), icon: "document", badge: "H3" },
    { kind: "code", label: t("editor.codeBlock"), icon: "code" },
    { kind: "blockquote", label: t("editor.blockquote"), icon: "quote" },
    { kind: "horizontalRule", label: t("editor.horizontalRule"), icon: "document", badge: "—" },
  ];

  return (
    <div className="block-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button block-picker__trigger"
        aria-label={t("editor.insertBlock")}
        title={t("editor.insertBlock")}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="code" />
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="desktop-menu__popover block-picker__popover" role="menu">
          <div className="block-picker__title">{t("editor.insertBlock")}</div>
          {blocks.map((block) => (
            <button
              type="button"
              className="desktop-menu__item block-picker__item"
              role="menuitem"
              key={block.kind}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onInsert(block.kind);
                setOpen(false);
              }}
            >
              <span className="block-picker__icon">
                {block.badge ?? <Icon name={block.icon} />}
              </span>
              <span>{block.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar({
  t,
  editorRef,
  selection,
  mode,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onLink,
  onPageSetup,
  onModeChange,
}: ToolbarProps) {
  const visualDisabled = mode === "source";
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controls = toolbarRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), select:not(:disabled)",
    );
    controls?.forEach((control, index) => {
      control.tabIndex = index === 0 ? 0 : -1;
    });
  }, [mode]);

  const navigateToolbar = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled), select:not(:disabled)",
      ),
    );
    const current = controls.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = controls[(current + direction + controls.length) % controls.length];
    controls[current].tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  };

  return (
    <div
      className="command-strip"
      ref={toolbarRef}
      role="toolbar"
      aria-label={t("ribbon.home")}
      onKeyDown={navigateToolbar}
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement;
        if (!target.matches("button, select")) return;
        toolbarRef.current
          ?.querySelectorAll<HTMLElement>("button, select")
          .forEach((control) => {
            control.tabIndex = control === target ? 0 : -1;
          });
      }}
    >
      <div className="ribbon-group ribbon-group--file-actions">
        <div className="command-group">
          <IconButton icon="newDocument" label={`${t("menu.file.new")} (Ctrl+N)`} onClick={onNew} />
          <IconButton icon="open" label={`${t("menu.file.open")} (Ctrl+O)`} onClick={onOpen} />
          <IconButton icon="save" label={`${t("menu.file.save")} (Ctrl+S)`} onClick={onSave} />
          <IconButton icon="saveAs" label={`${t("menu.file.saveAs")} (Ctrl+Shift+S)`} onClick={onSaveAs} />
        </div>
        <span className="ribbon-group__label">{t("ribbon.group.file")}</span>
      </div>
      <div className="command-separator command-separator--file-actions" />
      <div className="ribbon-group">
        <div className="command-group">
          <IconButton icon="undo" label={`${t("menu.edit.undo")} (Ctrl+Z)`} disabled={visualDisabled} onClick={() => editorRef.current?.undo()} />
          <IconButton icon="redo" label={`${t("menu.edit.redo")} (Ctrl+Y)`} disabled={visualDisabled} onClick={() => editorRef.current?.redo()} />
        </div>
        <span className="ribbon-group__label">{t("ribbon.group.history")}</span>
      </div>
      <div className="command-separator" />
      <div className="ribbon-group ribbon-group--wide">
        <div className="command-group">
          <label className="block-select">
            <span className="visually-hidden">{t("editor.heading")}</span>
            <select
              value={selection.block}
              disabled={visualDisabled}
              onChange={(event) => editorRef.current?.setBlock(event.target.value as BlockKind)}
            >
              <option value="paragraph">{t("editor.heading.normal")}</option>
              <option value="heading1">{t("editor.heading.level1")}</option>
              <option value="heading2">{t("editor.heading.level2")}</option>
              <option value="heading3">{t("editor.heading.level3")}</option>
              <option value="code">{t("editor.codeBlock")}</option>
            </select>
          </label>
          <IconButton icon="bold" label={`${t("editor.bold")} (Ctrl+B)`} selected={selection.bold} disabled={visualDisabled} onClick={() => editorRef.current?.toggleBold()} />
          <IconButton icon="italic" label={`${t("editor.italic")} (Ctrl+I)`} selected={selection.italic} disabled={visualDisabled} onClick={() => editorRef.current?.toggleItalic()} />
          <IconButton icon="link" label={t("editor.link")} selected={selection.link} disabled={visualDisabled} onClick={onLink} />
        </div>
        <span className="ribbon-group__label">{t("ribbon.group.text")}</span>
      </div>
      <div className="command-separator" />
      <div className="ribbon-group">
        <div className="command-group">
          <IconButton icon="bulletList" label={t("editor.bulletedList")} selected={selection.bulletList} disabled={visualDisabled} onClick={() => editorRef.current?.toggleBulletList()} />
          <IconButton icon="numberedList" label={t("editor.numberedList")} selected={selection.orderedList} disabled={visualDisabled} onClick={() => editorRef.current?.toggleOrderedList()} />
          <IconButton icon="quote" label={t("editor.blockquote")} disabled={visualDisabled} onClick={() => editorRef.current?.toggleBlockquote()} />
        </div>
        <span className="ribbon-group__label">{t("ribbon.group.paragraph")}</span>
      </div>
      <div className="command-separator" />
      <div className="ribbon-group ribbon-group--insert">
        <div className="command-group">
          <BlockPicker
            t={t}
            disabled={visualDisabled}
            onInsert={(block) => editorRef.current?.insertBlock(block)}
          />
          <TablePicker
            label={t("editor.table")}
            disabled={visualDisabled}
            onInsert={(rows, columns) => editorRef.current?.insertTable(rows, columns)}
          />
        </div>
        <span className="ribbon-group__label">{t("ribbon.group.insert")}</span>
      </div>
      <div className="command-separator" />
      <div className="ribbon-group ribbon-group--compact">
        <div className="command-group">
          <IconButton icon="pageSetup" label={t("pageSetup.title")} onClick={onPageSetup} />
        </div>
        <span className="ribbon-group__label">{t("ribbon.group.document")}</span>
      </div>
      <span className="command-strip__spacer" />
      <div className="ribbon-group ribbon-group--view">
        <div className="mode-switch" role="group" aria-label={t("menu.view")}>
          <button
            className={mode === "document" ? "is-selected" : ""}
            aria-label={t("menu.view.document")}
            title={t("menu.view.document")}
            aria-pressed={mode === "document"}
            onClick={() => onModeChange("document")}
          >
            <Icon name="document" />
          </button>
          <button
            className={mode === "web" ? "is-selected" : ""}
            aria-label={t("menu.view.web")}
            title={t("menu.view.web")}
            aria-pressed={mode === "web"}
            onClick={() => onModeChange("web")}
          >
            <Icon name="eye" />
          </button>
          <button
            className={mode === "source" ? "is-selected" : ""}
            aria-label={t("menu.view.source")}
            title={t("menu.view.source")}
            aria-pressed={mode === "source"}
            onClick={() => onModeChange("source")}
          >
            <Icon name="source" />
          </button>
        </div>
        <span className="ribbon-group__label">{t("ribbon.view")}</span>
      </div>
    </div>
  );
}
