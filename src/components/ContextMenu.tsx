import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { useManagedSurface } from "./WindowManager";

export interface ContextMenuItem {
  label?: string;
  shortcut?: string;
  icon?: IconName;
  action?: () => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  selected?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  label: string;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: (restoreFocus?: boolean) => void;
}

export function ContextMenu({ label, x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const surfaceId = useId();
  useManagedSurface({
    id: `context-menu-${surfaceId}`,
    kind: "popover",
    ownerId: "main",
    closePolicy: "outside-or-escape",
  });

  useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
      "[role='menuitem']:not(:disabled)",
    );
    firstItem?.focus();

    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose(false);
    };
    const closeOnViewportChange = () => onClose(false);
    document.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [onClose]);

  const enabledItems = () => Array.from(
    menuRef.current?.querySelectorAll<HTMLButtonElement>(
      "[role='menuitem']:not(:disabled)",
    ) ?? [],
  );

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={label}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose(true);
          return;
        }
        const menuItems = enabledItems();
        if (!menuItems.length) return;
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          menuItems[event.key === "Home" ? 0 : menuItems.length - 1]?.focus();
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const current = menuItems.indexOf(document.activeElement as HTMLButtonElement);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        menuItems[(current + direction + menuItems.length) % menuItems.length]?.focus();
      }}
    >
      {items.map((item, index) => item.separator ? (
        <div className="context-menu__separator" role="separator" key={`separator-${index}`} />
      ) : (
        <button
          type="button"
          className={`context-menu__item ${item.selected ? "is-selected" : ""}`}
          role="menuitem"
          disabled={item.disabled}
          key={`${item.label}-${index}`}
          onClick={() => {
            void item.action?.();
            onClose(false);
          }}
        >
          <span className="context-menu__icon" aria-hidden="true">
            {item.icon ? <Icon name={item.icon} /> : item.selected ? "✓" : null}
          </span>
          <span className="context-menu__label">{item.label}</span>
          {item.shortcut && <kbd>{item.shortcut}</kbd>}
        </button>
      ))}
    </div>,
    document.body,
  );
}
