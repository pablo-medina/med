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
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import { useManagedSurface } from "./WindowManager";

type WorkspaceMode = "visual" | "source";

interface ToolbarProps {
  t: Translate;
  editorRef: RefObject<RichEditorHandle | null>;
  selection: EditorSelectionState;
  mode: WorkspaceMode;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onPreferences: () => void;
  onExit: () => void;
  onLink: () => void;
  onModeChange: (mode: WorkspaceMode) => void;
}

interface MenuProps {
  label: string;
  items: Array<{
    label?: string;
    shortcut?: string;
    action?: () => void;
    separator?: boolean;
  }>;
}

function DesktopMenu({ label, items }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const surfaceId = useId();
  useManagedSurface(
    {
      id: `menu-${surfaceId}`,
      kind: "popover",
      ownerId: "main",
      closePolicy: "outside-or-escape",
    },
    open,
  );

  const focusItem = (position: "first" | "last") => {
    requestAnimationFrame(() => {
      const menuItems = rootRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']",
      );
      if (!menuItems?.length) return;
      menuItems[position === "first" ? 0 : menuItems.length - 1].focus();
    });
  };

  const openMenu = () => {
    setOpen(true);
    focusItem("first");
  };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="desktop-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className="menu-bar__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          openMenu();
        }}
      >
        {label}
      </button>
      {open && (
        <div
          className="desktop-menu__popover"
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            const menuItems = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']"),
            );
            if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              menuItems[event.key === "Home" ? 0 : menuItems.length - 1]?.focus();
              return;
            }
            if (event.key.length === 1 && /[\p{L}\p{N}]/u.test(event.key)) {
              const match = menuItems.find((item) =>
                item.textContent?.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()),
              );
              if (match) {
                event.preventDefault();
                match.focus();
              }
              return;
            }
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const index = menuItems.indexOf(document.activeElement as HTMLButtonElement);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            const next = (index + direction + menuItems.length) % menuItems.length;
            menuItems[next]?.focus();
          }}
        >
          {items.map((item, index) =>
            item.separator ? (
              <div
                className="desktop-menu__separator"
                role="separator"
                key={`separator-${index}`}
              />
            ) : (
              <button
                className="desktop-menu__item"
                role="menuitem"
                key={item.label}
                onClick={() => {
                  item.action?.();
                  setOpen(false);
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </button>
            ),
          )}
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
  onExport,
  onPreferences,
  onExit,
  onLink,
  onModeChange,
}: ToolbarProps) {
  const visualDisabled = mode !== "visual";
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
    <>
      <nav className="menu-bar" aria-label={t("app.menu")}>
        <DesktopMenu
          label={t("menu.file")}
          items={[
            { label: t("menu.file.new"), shortcut: "Ctrl+N", action: onNew },
            { label: t("menu.file.open"), shortcut: "Ctrl+O", action: onOpen },
            { separator: true },
            { label: t("menu.file.save"), shortcut: "Ctrl+S", action: onSave },
            { label: t("menu.file.saveAs"), shortcut: "Ctrl+Shift+S", action: onSaveAs },
            { separator: true },
            { label: t("menu.file.export"), action: onExport },
            { separator: true },
            { label: t("menu.file.preferences"), action: onPreferences },
            { separator: true },
            { label: t("menu.file.exit"), action: onExit },
          ]}
        />
        <DesktopMenu
          label={t("menu.view")}
          items={[
            { label: t("menu.view.visualEditor"), action: () => onModeChange("visual") },
            { label: t("menu.view.source"), action: () => onModeChange("source") },
          ]}
        />
        <span className="menu-bar__spacer" />
      </nav>
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
        <div className="command-group">
          <IconButton icon="newDocument" label={`${t("menu.file.new")} (Ctrl+N)`} onClick={onNew} />
          <IconButton icon="open" label={`${t("menu.file.open")} (Ctrl+O)`} onClick={onOpen} />
          <IconButton icon="save" label={`${t("menu.file.save")} (Ctrl+S)`} onClick={onSave} />
          <IconButton icon="saveAs" label={`${t("menu.file.saveAs")} (Ctrl+Shift+S)`} onClick={onSaveAs} />
        </div>
        <div className="command-separator" />
        <div className="command-group">
          <IconButton icon="undo" label={`${t("menu.edit.undo")} (Ctrl+Z)`} disabled={visualDisabled} onClick={() => editorRef.current?.undo()} />
          <IconButton icon="redo" label={`${t("menu.edit.redo")} (Ctrl+Y)`} disabled={visualDisabled} onClick={() => editorRef.current?.redo()} />
        </div>
        <div className="command-separator" />
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
        <div className="command-group">
          <IconButton icon="bold" label={`${t("editor.bold")} (Ctrl+B)`} selected={selection.bold} disabled={visualDisabled} onClick={() => editorRef.current?.toggleBold()} />
          <IconButton icon="italic" label={`${t("editor.italic")} (Ctrl+I)`} selected={selection.italic} disabled={visualDisabled} onClick={() => editorRef.current?.toggleItalic()} />
          <IconButton icon="link" label={t("editor.link")} selected={selection.link} disabled={visualDisabled} onClick={onLink} />
        </div>
        <div className="command-separator" />
        <div className="command-group">
          <IconButton icon="bulletList" label={t("editor.bulletedList")} disabled={visualDisabled} onClick={() => editorRef.current?.toggleBulletList()} />
          <IconButton icon="numberedList" label={t("editor.numberedList")} disabled={visualDisabled} onClick={() => editorRef.current?.toggleOrderedList()} />
          <IconButton icon="quote" label={t("editor.blockquote")} disabled={visualDisabled} onClick={() => editorRef.current?.toggleBlockquote()} />
        </div>
        <span className="command-strip__spacer" />
        <div className="mode-switch" role="group" aria-label={t("menu.view")}>
          <button
            className={mode === "visual" ? "is-selected" : ""}
            aria-label={t("menu.view.visualEditor")}
            title={t("menu.view.visualEditor")}
            aria-pressed={mode === "visual"}
            onClick={() => onModeChange("visual")}
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
      </div>
    </>
  );
}
