import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useManagedSurface } from "./WindowManager";

export interface FileMenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

export function FileMenu({
  label,
  items,
}: {
  label: string;
  items: FileMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const surfaceId = useId();
  useManagedSurface(
    {
      id: `file-menu-${surfaceId}`,
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
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="title-file-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="title-file-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          openMenu();
        }}
      >
        <span>{label}</span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div
          className="desktop-menu__popover title-file-menu__popover"
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
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const index = menuItems.indexOf(document.activeElement as HTMLButtonElement);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            const next = (index + direction + menuItems.length) % menuItems.length;
            menuItems[next]?.focus();
          }}
        >
          {items.map((item, index) => item.separator ? (
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
          ))}
        </div>
      )}
    </div>
  );
}
