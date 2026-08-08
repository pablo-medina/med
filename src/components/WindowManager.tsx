import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type SurfaceKind =
  | "appWindow"
  | "childWindow"
  | "modalDialog"
  | "popover"
  | "panel";

export interface SurfaceCapabilities {
  resizable: boolean;
  maximizable: boolean;
  minimizable: boolean;
  modal: boolean;
}

export interface ManagedSurfaceDescriptor {
  id: string;
  kind: SurfaceKind;
  ownerId: string | null;
  closePolicy: "explicit" | "escape" | "outside-or-escape";
}

export const surfaceCapabilities: Record<SurfaceKind, SurfaceCapabilities> = {
  appWindow: { resizable: true, maximizable: true, minimizable: true, modal: false },
  childWindow: { resizable: true, maximizable: false, minimizable: false, modal: false },
  modalDialog: { resizable: false, maximizable: false, minimizable: false, modal: true },
  popover: { resizable: false, maximizable: false, minimizable: false, modal: false },
  panel: { resizable: true, maximizable: false, minimizable: false, modal: false },
};

export interface DialogController<T> {
  close: (result?: T) => void;
}

export interface DialogHandle<T> {
  result: Promise<T | undefined>;
  close: (result?: T) => void;
}

export interface DialogOptions<T> {
  title: ReactNode;
  description?: string;
  closeOnEscape?: boolean;
  width?: "compact" | "standard" | "wide";
  render: (controller: DialogController<T>) => ReactNode;
}

interface DialogEntry {
  id: string;
  title: ReactNode;
  description?: string;
  closeOnEscape: boolean;
  width: "compact" | "standard" | "wide";
  returnFocus: HTMLElement | null;
  render: (controller: DialogController<unknown>) => ReactNode;
  resolve: (result: unknown) => void;
}

interface WindowManagerValue {
  openDialog: <T>(options: DialogOptions<T>) => DialogHandle<T>;
  showDialog: <T>(options: DialogOptions<T>) => Promise<T | undefined>;
  registerSurface: (surface: ManagedSurfaceDescriptor) => () => void;
}

const WindowManagerContext = createContext<WindowManagerValue | null>(null);
let nextDialogId = 0;

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function ManagedDialog({ entry, onClose }: { entry: DialogEntry; onClose: (result?: unknown) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const autofocus = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
    (autofocus ?? firstFocusable)?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && entry.closeOnEscape) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-layer" role="presentation">
      <div className="dialog-scrim" />
      <div
        ref={dialogRef}
        className={`dialog dialog--${entry.width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={entry.description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
      >
        <header className="dialog__header">
          <h2 id={titleId}>{entry.title}</h2>
          {entry.description && <p id={descriptionId}>{entry.description}</p>}
        </header>
        <div className="dialog__content">
          {entry.render({ close: onClose })}
        </div>
      </div>
    </div>
  );
}

export function WindowManager({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<DialogEntry[]>([]);
  const applicationRef = useRef<HTMLDivElement>(null);
  const surfacesRef = useRef(
    new Map<string, ManagedSurfaceDescriptor>([
      [
        "main",
        {
          id: "main",
          kind: "appWindow",
          ownerId: null,
          closePolicy: "explicit",
        },
      ],
    ]),
  );

  const registerSurface = useCallback((surface: ManagedSurfaceDescriptor) => {
    surfacesRef.current.set(surface.id, surface);
    return () => surfacesRef.current.delete(surface.id);
  }, []);

  useEffect(() => {
    const suppressWebViewMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", suppressWebViewMenu);
    return () => document.removeEventListener("contextmenu", suppressWebViewMenu);
  }, []);

  const closeDialog = useCallback((id: string, result?: unknown) => {
    setDialogs((entries) => {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) return entries;
      surfacesRef.current.delete(id);
      entry.resolve(result);
      queueMicrotask(() => entry.returnFocus?.focus());
      return entries.filter((candidate) => candidate.id !== id);
    });
  }, []);

  useEffect(() => {
    if (!applicationRef.current) return;
    (applicationRef.current as HTMLDivElement & { inert: boolean }).inert = dialogs.length > 0;
  }, [dialogs.length]);

  const openDialog = useCallback(<T,>(options: DialogOptions<T>): DialogHandle<T> => {
    const id = `dialog-${Date.now()}-${++nextDialogId}`;
    let resolveResult: (result: T | undefined) => void = () => {};
    const result = new Promise<T | undefined>((resolve) => {
      resolveResult = resolve;
    });
    surfacesRef.current.set(id, {
      id,
      kind: "modalDialog",
      ownerId: "main",
      closePolicy: options.closeOnEscape === false ? "explicit" : "escape",
    });
    setDialogs((entries) => [
      ...entries,
      {
        id,
        title: options.title,
        description: options.description,
        closeOnEscape: options.closeOnEscape ?? true,
        width: options.width ?? "standard",
        returnFocus: document.activeElement as HTMLElement | null,
        render: options.render as (controller: DialogController<unknown>) => ReactNode,
        resolve: resolveResult as (result: unknown) => void,
      },
    ]);
    return {
      result,
      close: (value) => closeDialog(id, value),
    };
  }, [closeDialog]);

  const showDialog = useCallback(<T,>(options: DialogOptions<T>) => {
    return openDialog(options).result;
  }, [openDialog]);

  return (
    <WindowManagerContext.Provider value={{ openDialog, showDialog, registerSurface }}>
      <div ref={applicationRef} className="managed-application">{children}</div>
      {dialogs.length > 0 && (
        <ManagedDialog
          key={dialogs[dialogs.length - 1].id}
          entry={dialogs[dialogs.length - 1]}
          onClose={(result) => closeDialog(dialogs[dialogs.length - 1].id, result)}
        />
      )}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const context = useContext(WindowManagerContext);
  if (!context) throw new Error("useWindowManager must be used inside WindowManager");
  return context;
}

export function useManagedSurface(
  surface: ManagedSurfaceDescriptor,
  active = true,
) {
  const { registerSurface } = useWindowManager();
  const { id, kind, ownerId, closePolicy } = surface;
  useEffect(() => {
    if (!active) return;
    return registerSurface({ id, kind, ownerId, closePolicy });
  }, [active, closePolicy, id, kind, ownerId, registerSurface]);
}
