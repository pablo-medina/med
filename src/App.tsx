import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { locale as systemLocale } from "@tauri-apps/plugin-os";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Bold, ChevronDown, Code2, Columns2, Download, Eye, File, FilePlus2, FolderOpen, History,
  Heading2, Info, Italic, Link, List, ListOrdered, Minus, PanelLeftClose,
  PanelLeftOpen, Printer, Quote, Redo2, Save, Settings as SettingsIcon, Undo2, X
} from "lucide-react";
import { exportDocx, exportHtml } from "./exporters";
import { extractHeadings, renderMarkdown } from "./markdown";
import { inferLocale, translate, type MessageKey } from "./i18n";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import type { AppConfig, EditorDocument, Locale, Settings, Theme, ViewMode } from "./types";

const EMPTY = "";
const defaultSettings: Settings = { locale: "en", theme: "midnight", fontSize: 15, wordWrap: true };
const isNative = "__TAURI_INTERNALS__" in window;
const id = () => crypto.randomUUID();
const titleFromPath = (path: string) => path.split(/[\\/]/).pop() || "Untitled.md";

type NativeDocument = { path: string; content: string };
type Modal = "settings" | "unsaved" | null;
type ContextMenu = { x: number; y: number; kind: "editor" | "titlebar" } | null;
type StoredConfig = {
  version?: number;
  settings?: Partial<Settings>;
  view?: { mode?: ViewMode; outline?: boolean; sidebar?: boolean };
};

function migratedSettings(config: StoredConfig): Settings {
  const storedLocale = config.settings?.locale;
  const locale: Locale = config.version === 1 && storedLocale === "es"
    ? "es-AR"
    : storedLocale === "en" || storedLocale === "es" || storedLocale === "es-AR"
      ? storedLocale
      : defaultSettings.locale;
  return { ...defaultSettings, ...config.settings, locale };
}

export default function App() {
  const [settings, setSettings] = useState(defaultSettings);
  const [documents, setDocuments] = useState<EditorDocument[]>([]);
  const [activeId, setActiveId] = useState("");
  const [mode, setMode] = useState<ViewMode>("split");
  const [sidebar, setSidebar] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"general" | "about">("general");
  const [modal, setModal] = useState<Modal>(null);
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [maximized, setMaximized] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [toast, setToast] = useState("");
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewRef = useRef<HTMLElement>(null);
  const documentsRef = useRef<EditorDocument[]>([]);
  const startupHandled = useRef(false);
  const windowRevealed = useRef(false);
  documentsRef.current = documents;
  const active = documents.find((document) => document.id === activeId) || null;
  const t = useCallback((key: MessageKey) => translate(settings.locale, key), [settings.locale]);
  const html = useMemo(() => renderMarkdown(active?.content || ""), [active?.content]);
  const headings = useMemo(() => extractHeadings(active?.content || ""), [active?.content]);
  const stats = useMemo(() => {
    const value = active?.content || "";
    return { words: value.trim() ? value.trim().split(/\s+/).length : 0, characters: value.length };
  }, [active?.content]);

  const addNativeDocument = useCallback((file: NativeDocument) => {
    const current = documentsRef.current;
    const existing = current.find((document) => document.path?.toLowerCase() === file.path.toLowerCase());
    if (existing) { setActiveId(existing.id); return; }
    const document = { id: id(), path: file.path, title: titleFromPath(file.path), content: file.content, savedContent: file.content };
    const replaceBlank = current.length === 1
      && current[0].path === null
      && current[0].content === EMPTY
      && current[0].savedContent === EMPTY;
    const next = replaceBlank ? [document] : [...current, document];
    documentsRef.current = next;
    setDocuments(next);
    setActiveId(document.id);
  }, []);

  const newDocument = useCallback(() => {
    const document: EditorDocument = { id: id(), path: null, title: t("untitled"), content: EMPTY, savedContent: EMPTY };
    const next = [...documentsRef.current, document];
    documentsRef.current = next;
    setDocuments(next);
    setActiveId(document.id);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [t]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.lang = settings.locale;
  }, [settings]);

  useEffect(() => {
    let disposed = false;
    if (!isNative) {
      setSettings((current) => ({ ...current, locale: inferLocale() }));
      setConfigReady(true);
      return () => { disposed = true; };
    }
    void (async () => {
      try {
        const content = await invoke<string | null>("read_config");
        if (content) {
          const config = JSON.parse(content) as StoredConfig;
          if (disposed) return;
          if (config.settings) setSettings(migratedSettings(config));
          if (config.view?.mode) setMode(config.view.mode);
          if (config.version === 3 && typeof config.view?.outline === "boolean") setSidebar(config.view.outline);
          else setSidebar(false);
        } else {
          const value = await systemLocale().catch(() => null);
          if (!disposed) setSettings((current) => ({ ...current, locale: inferLocale(value) }));
        }
      } catch {
        const value = await systemLocale().catch(() => null);
        if (!disposed) setSettings((current) => ({ ...current, locale: inferLocale(value) }));
      } finally {
        if (!disposed) setConfigReady(true);
      }
    })();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!configReady) return;
    let disposed = false;
    let stopListening: (() => void) | undefined;
    if (isNative) {
      void listen<NativeDocument>("open-document", ({ payload }) => addNativeDocument(payload)).then((unlisten) => {
        if (disposed) unlisten();
        else stopListening = unlisten;
      });
    }
    return () => { disposed = true; stopListening?.(); };
  }, [addNativeDocument, configReady]);

  useEffect(() => {
    if (!configReady || startupHandled.current) return;
    if (!startupHandled.current) {
      startupHandled.current = true;
      if (isNative) {
        void invoke<NativeDocument | null>("startup_document")
          .then((file) => {
            if (file) addNativeDocument(file);
            else newDocument();
          })
          .catch(() => newDocument());
      } else {
        newDocument();
      }
    }
  }, [addNativeDocument, configReady, newDocument]);

  useEffect(() => {
    if (!isNative || !configReady || !activeId || windowRevealed.current) return;
    const frame = requestAnimationFrame(() => {
      windowRevealed.current = true;
      void invoke("reveal_main_window").then(() => requestAnimationFrame(() => editorRef.current?.refreshLayout()));
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, configReady]);

  useEffect(() => {
    if (!isNative || !configReady) return;
    const config: AppConfig = { version: 3, settings, view: { mode, outline: sidebar } };
    const timer = window.setTimeout(() => {
      void invoke("write_config", { content: JSON.stringify(config, null, 2) });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [configReady, mode, settings, sidebar]);

  useEffect(() => {
    const suppress = (event: Event) => event.preventDefault();
    document.addEventListener("contextmenu", suppress);
    return () => document.removeEventListener("contextmenu", suppress);
  }, []);

  useEffect(() => {
    if (!isNative) return;
    const appWindow = getCurrentWindow();
    const syncMaximized = () => void appWindow.isMaximized().then(setMaximized);
    syncMaximized();
    const unlisten = appWindow.onResized(syncMaximized);
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "n") { event.preventDefault(); newDocument(); }
      if (modifier && event.key.toLowerCase() === "o") { event.preventDefault(); void openDocument(); }
      if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); void saveDocument(event.shiftKey); }
      if (modifier && event.key.toLowerCase() === "p") { event.preventDefault(); printDocument(); }
      if (modifier && ["1", "2", "3"].includes(event.key)) { event.preventDefault(); setMode(({ "1": "edit", "2": "split", "3": "preview" } as const)[event.key as "1" | "2" | "3"]); }
      if (event.key === "Escape") { setExportOpen(false); setDocumentsOpen(false); setContextMenu(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  async function openDocument() {
    try {
      const path = await open({ multiple: false, filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
      if (path) addNativeDocument(await invoke<NativeDocument>("read_document", { path }));
    } catch { showToast(t("openError")); }
  }

  async function saveDocument(forceSaveAs = false, target = active): Promise<boolean> {
    if (!target) return false;
    try {
      let path = forceSaveAs ? null : target.path;
      if (!path) path = await save({ defaultPath: target.title, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (!path) return false;
      const savedPath = await invoke<string>("write_document", { path, content: target.content });
      setDocuments((current) => current.map((document) => document.id === target.id
        ? { ...document, path: savedPath, title: titleFromPath(savedPath), savedContent: document.content }
        : document));
      return true;
    } catch { showToast(t("saveError")); return false; }
  }

  function updateContent(content: string) {
    setDocuments((current) => current.map((document) => document.id === activeId ? { ...document, content } : document));
  }

  function requestClose(documentId: string) {
    const document = documents.find((item) => item.id === documentId);
    if (!document) return;
    if (document.content !== document.savedContent) { setPendingClose(documentId); setModal("unsaved"); return; }
    closeDocument(documentId);
  }

  function closeDocument(documentId: string) {
    const current = documentsRef.current;
    const index = current.findIndex((document) => document.id === documentId);
    let next = current.filter((document) => document.id !== documentId);
    if (next.length === 0) {
      const blank: EditorDocument = { id: id(), path: null, title: t("untitled"), content: EMPTY, savedContent: EMPTY };
      next = [blank];
      setActiveId(blank.id);
    } else if (activeId === documentId) {
      setActiveId(next[Math.min(index, next.length - 1)].id);
    }
    documentsRef.current = next;
    setDocuments(next);
    setModal(null); setPendingClose(null);
  }

  function wrapSelection(before: string, after = before, placeholder = "text") {
    const editor = editorRef.current;
    if (!editor || !active) return;
    const { start, end } = editor.getSelection();
    const selected = active.content.slice(start, end) || placeholder;
    updateContent(active.content.slice(0, start) + before + selected + after + active.content.slice(end));
    requestAnimationFrame(() => { editor.focus(); editor.setSelection(start + before.length, start + before.length + selected.length); });
  }

  function prefixLines(prefix: string) {
    const editor = editorRef.current;
    if (!editor || !active) return;
    const selection = editor.getSelection();
    const start = active.content.lastIndexOf("\n", selection.start - 1) + 1;
    const endBreak = active.content.indexOf("\n", selection.end);
    const end = endBreak < 0 ? active.content.length : endBreak;
    const block = active.content.slice(start, end).split("\n").map((line, index) => prefix.replace("%n", String(index + 1)) + line).join("\n");
    updateContent(active.content.slice(0, start) + block + active.content.slice(end));
  }

  function printDocument() {
    if (!active) return;
    setExportOpen(false); setDocumentsOpen(false);
    document.body.classList.add("printing");
    const cleanup = () => document.body.classList.remove("printing");
    window.addEventListener("afterprint", cleanup, { once: true });
    requestAnimationFrame(() => { window.print(); window.setTimeout(cleanup, 1500); });
  }

  async function runExport(kind: "docx" | "html") {
    if (!active) return;
    setExportOpen(false);
    try { await (kind === "docx" ? exportDocx(active.title, active.content) : exportHtml(active.title, active.content)); }
    catch { showToast(t("exportError")); }
  }

  function scrollPreviewTo(fragment: string) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(fragment));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  async function followPreviewLink(event: React.MouseEvent<HTMLElement>) {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    if (href.startsWith("#")) {
      scrollPreviewTo(href.slice(1));
      return;
    }
    try {
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        if (isNative) await openUrl(href);
        else window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      const [linkPath, fragment] = href.split("#", 2);
      if (active?.path && /\.(md|markdown)$/i.test(linkPath)) {
        const file = await invoke<NativeDocument>("read_linked_document", {
          basePath: active.path,
          linkPath: decodeURIComponent(linkPath),
        });
        addNativeDocument(file);
        if (fragment) scrollPreviewTo(fragment);
      }
    } catch {
      showToast(t("openError"));
    }
  }

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2400); }

  async function toggleWindowMaximize() {
    if (!isNative) return;
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    setMaximized(await appWindow.isMaximized());
  }

  function goToLine(line: number) {
    if (!active) return;
    const position = active.content.split("\n").slice(0, line - 1).reduce((sum, value) => sum + value.length + 1, 0);
    setMode((current) => current === "preview" ? "split" : current);
    requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelection(position); });
  }

  const dirty = active ? active.content !== active.savedContent : false;

  return <div className="app-shell" onClick={() => { setExportOpen(false); setDocumentsOpen(false); setContextMenu(null); }}>
    <header className="titlebar" data-tauri-drag-region
      onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("button")) void toggleWindowMaximize(); }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: event.clientX, y: event.clientY, kind: "titlebar" }); }}>
      <div className="titlebar-left" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region><img className="brand-icon" src="/med-icon.png" alt="" /></div>
        <div className="titlebar-file-actions" onDoubleClick={(event) => event.stopPropagation()}>
          <IconButton label={t("newFile")} onClick={newDocument}><FilePlus2 /></IconButton>
          <IconButton label={t("open")} onClick={() => void openDocument()}><FolderOpen /></IconButton>
          <IconButton label={t("save")} disabled={!active || !dirty} onClick={() => void saveDocument()}><Save /></IconButton>
          <div className="menu-wrap titlebar-documents">
            <IconButton label={t("documents")} onClick={(event) => { event.stopPropagation(); setExportOpen(false); setDocumentsOpen(!documentsOpen); }}><History /></IconButton>
            {documentsOpen && <div className="popup-menu documents-menu" onClick={(event) => event.stopPropagation()}>
              <div className="popover-heading"><span>{t("documents")}</span><span className="count">{documents.length}</span></div>
              <div className="popover-document-list">{documents.map((document) => <button key={document.id} className={`popover-document ${document.id === activeId ? "active" : ""}`} onClick={() => { setActiveId(document.id); setDocumentsOpen(false); }}>
                <File /><span>{document.title}</span>{document.content !== document.savedContent && <i />}
                <span className="tab-close" role="button" aria-label={t("close")} onClick={(event) => { event.stopPropagation(); requestClose(document.id); }}><X /></span>
              </button>)}</div>
            </div>}
          </div>
          <IconButton className={sidebar ? "active-titlebar-button" : ""} label={t("outline")} onClick={() => setSidebar(!sidebar)}>{sidebar ? <PanelLeftClose /> : <PanelLeftOpen />}</IconButton>
          <IconButton label={t("printPdf")} disabled={!active} onClick={printDocument}><Printer /></IconButton>
          <div className="menu-wrap titlebar-export">
            <IconButton className="titlebar-export-button" label={t("export")} disabled={!active} onClick={(event) => { event.stopPropagation(); setDocumentsOpen(false); setExportOpen(!exportOpen); }}><Download /></IconButton>
            {exportOpen && <div className="popup-menu export-menu" onClick={(event) => event.stopPropagation()}>
              <MenuButton icon={<File />} label={t("exportDocx")} onClick={() => void runExport("docx")} />
              <MenuButton icon={<Code2 />} label={t("exportHtml")} onClick={() => void runExport("html")} />
            </div>}
          </div>
        </div>
      </div>
      <div className="window-title" data-tauri-drag-region>{active?.title || "MED"}{dirty && <span className="dirty-dot" />}</div>
      <div className="titlebar-right" onDoubleClick={(event) => event.stopPropagation()}>
        <div className="mode-switch" aria-label={t("viewMode")}>
          <ModeButton active={mode === "edit"} label={t("edit")} onClick={() => setMode("edit")}><File /></ModeButton>
          <ModeButton active={mode === "split"} label={t("split")} onClick={() => setMode("split")}><Columns2 /></ModeButton>
          <ModeButton active={mode === "preview"} label={t("preview")} onClick={() => setMode("preview")}><Eye /></ModeButton>
        </div>
        <IconButton label={t("settings")} onClick={() => { setSettingsSection("general"); setModal("settings"); }}><SettingsIcon /></IconButton>
        <div className="window-controls">
          <IconButton label={t("minimize")} onClick={() => void getCurrentWindow().minimize()}><Minus /></IconButton>
          <IconButton label={t(maximized ? "restore" : "maximize")} onClick={() => void toggleWindowMaximize()}>{maximized ? <RestoreWindowIcon /> : <MaximizeWindowIcon />}</IconButton>
          <IconButton className="window-close" label={t("closeWindow")} onClick={() => void getCurrentWindow().close()}><X /></IconButton>
        </div>
      </div>
    </header>

    <div className="workspace">
      {sidebar && <aside className="sidebar">
        <section className="sidebar-section outline-section">
          <div className="section-title"><span>{t("outline")}</span><span className="count">{headings.length}</span></div>
          <div className="outline-list">{headings.length ? headings.map((heading) => <button key={`${heading.line}-${heading.text}`} style={{ paddingLeft: `${12 + (heading.level - 1) * 12}px` }} onClick={() => goToLine(heading.line)}><span>H{heading.level}</span>{heading.text}</button>) : <p>{t("noOutline")}</p>}</div>
        </section>
      </aside>}

      <main className="main-area">
        {!active ? null
        : <div className={`document-workspace mode-${mode}`}>
          <section className="editor-pane">
            <div className="editor-toolbar" aria-label={t("formatting")}>
              <IconButton label={t("undo")} onClick={() => editorRef.current?.undo()}><Undo2 /></IconButton>
              <IconButton label={t("redo")} onClick={() => editorRef.current?.redo()}><Redo2 /></IconButton>
              <span className="editor-toolbar-separator" />
              <IconButton label={t("bold")} onClick={() => wrapSelection("**")}><Bold /></IconButton>
              <IconButton label={t("italic")} onClick={() => wrapSelection("*")}><Italic /></IconButton>
              <IconButton label={t("heading")} onClick={() => prefixLines("## ")}><Heading2 /></IconButton>
              <IconButton label={t("link")} onClick={() => wrapSelection("[", "](https://)")}><Link /></IconButton>
              <IconButton label={t("code")} onClick={() => wrapSelection("`")}><Code2 /></IconButton>
              <IconButton label={t("quote")} onClick={() => prefixLines("> ")}><Quote /></IconButton>
              <IconButton label={t("bulletedList")} onClick={() => prefixLines("- ")}><List /></IconButton>
              <IconButton label={t("numberedList")} onClick={() => prefixLines("%n. ")}><ListOrdered /></IconButton>
            </div>
            <MarkdownEditor key={active.id} ref={editorRef} ariaLabel={t("edit")} value={active.content}
              fontSize={settings.fontSize} wordWrap={settings.wordWrap} onChange={updateContent}
              onCursorChange={(line, column) => setCursor({ line, column })}
              onContextMenu={(x, y) => setContextMenu({ x, y, kind: "editor" })} />
          </section>
          <section ref={previewRef} className="preview-pane" onClick={(event) => void followPreviewLink(event)}><article className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} /></section>
        </div>}
        {active && mode !== "preview" && <footer className="statusbar"><span>{t("line")} {cursor.line}, {t("column")} {cursor.column}</span><span>{stats.words} {t("words")}</span><span>{stats.characters} {t("characters")}</span><span>Markdown</span></footer>}
      </main>
    </div>

    {contextMenu && <div className="popup-menu context-menu" style={{ left: Math.max(8, Math.min(contextMenu.x, innerWidth - 198)), top: Math.max(8, Math.min(contextMenu.y, innerHeight - (contextMenu.kind === "editor" ? 250 : 160))) }} onClick={(event) => { event.stopPropagation(); setContextMenu(null); }}>
      {contextMenu.kind === "editor" ? <>
        <MenuButton icon={<Undo2 />} label={t("undo")} onClick={() => editorRef.current?.undo()} />
        <MenuButton icon={<Redo2 />} label={t("redo")} onClick={() => editorRef.current?.redo()} />
        <div className="menu-separator" />
        <MenuButton label={t("cut")} onClick={() => editorRef.current?.runClipboardCommand("cut")} />
        <MenuButton label={t("copy")} onClick={() => editorRef.current?.runClipboardCommand("copy")} />
        <MenuButton label={t("paste")} onClick={() => editorRef.current?.runClipboardCommand("paste")} />
        <MenuButton label={t("selectAll")} onClick={() => editorRef.current?.selectAll()} />
      </> : <>
        <MenuButton icon={<Minus />} label={t("minimize")} onClick={() => void getCurrentWindow().minimize()} />
        <MenuButton icon={maximized ? <RestoreWindowIcon /> : <MaximizeWindowIcon />} label={t(maximized ? "restore" : "maximize")} onClick={() => void toggleWindowMaximize()} />
        <div className="menu-separator" />
        <MenuButton icon={<X />} label={t("closeWindow")} onClick={() => void getCurrentWindow().close()} />
      </>}
    </div>}

    {modal === "settings" && <Dialog className="settings-dialog" title={t("settings")} closeLabel={t("close")} onClose={() => setModal(null)}>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("settingsSections")}>
          <button className={settingsSection === "general" ? "active" : ""} onClick={() => setSettingsSection("general")}><SettingsIcon />{t("general")}</button>
          <button className={settingsSection === "about" ? "active" : ""} onClick={() => setSettingsSection("about")}><Info />{t("about")}</button>
        </nav>
        <section className="settings-panel">
          {settingsSection === "general" ? <>
            <h3>{t("general")}</h3>
            <SettingRow label={t("theme")}><SelectControl label={t("theme")} value={settings.theme} onChange={(value) => setSettings({ ...settings, theme: value as Theme })} options={[{ value: "system", label: t("system") }, { value: "midnight", label: t("midnight") }, { value: "light", label: t("light") }, { value: "sepia", label: t("sepia") }]} /></SettingRow>
            <SettingRow label={t("language")}><SelectControl label={t("language")} value={settings.locale} onChange={(value) => setSettings({ ...settings, locale: value as Locale })} options={[{ value: "en", label: t("english") }, { value: "es", label: t("spanish") }, { value: "es-AR", label: t("spanishArgentina") }]} /></SettingRow>
            <SettingRow label={t("fontSize")}><input type="number" min="12" max="24" value={settings.fontSize} onChange={(event) => setSettings({ ...settings, fontSize: Number(event.target.value) })} /></SettingRow>
            <SettingRow label={t("wordWrap")}><input type="checkbox" checked={settings.wordWrap} onChange={(event) => setSettings({ ...settings, wordWrap: event.target.checked })} /></SettingRow>
          </> : <div className="about"><img className="about-icon" src="/med-icon.png" alt="" /><h2>MED</h2><p>Markdown Editor</p><dl><div><dt>Version</dt><dd>0.1.0</dd></div><div><dt>Author</dt><dd>{t("author")}</dd></div><div><dt>License</dt><dd>{t("license")}</dd></div></dl></div>}
        </section>
      </div>
    </Dialog>}
    {modal === "unsaved" && <Dialog title={t("unsavedTitle")} onClose={() => setModal(null)}><p className="dialog-message">{t("unsavedMessage")}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => pendingClose && closeDocument(pendingClose)}>{t("discard")}</button><button className="secondary-button" onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button" onClick={async () => { const document = documents.find((item) => item.id === pendingClose); if (document && await saveDocument(false, document)) closeDocument(document.id); }}>{t("save")}</button></div></Dialog>}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function IconButton({ label, children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}>{children}</button>;
}
function ModeButton({ active, label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; label: string }) {
  return <button className={active ? "active" : ""} title={label} aria-label={label} {...props}>{children}</button>;
}
function MenuButton({ icon, label, onClick }: { icon?: React.ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick}>{icon || <span />}<span>{label}</span></button>;
}
function Dialog({ title, closeLabel = "Close", className = "", onClose, children }: { title: string; closeLabel?: string; className?: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    setPosition({ left: rect.left, top: rect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragDialog(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const dialog = dialogRef.current;
    if (!drag || !dialog || drag.pointerId !== event.pointerId) return;
    const rect = dialog.getBoundingClientRect();
    const left = Math.max(8, Math.min(event.clientX - drag.offsetX, innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(event.clientY - drag.offsetY, innerHeight - rect.height - 8));
    setPosition({ left, top });
  }

  function stopDrag(event: React.PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div className="dialog-backdrop" role="presentation"><section ref={dialogRef} className={`dialog ${className}`} style={position ? { position: "fixed", left: position.left, top: position.top } : undefined} role="dialog" aria-modal="true" aria-label={title}><header onPointerDown={startDrag} onPointerMove={dragDialog} onPointerUp={stopDrag} onPointerCancel={stopDrag}><h2>{title}</h2><IconButton label={closeLabel} onClick={onClose}><X /></IconButton></header><div className="dialog-content">{children}</div></section></div>;
}
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) { return <div className="setting-row"><span>{label}</span>{children}</div>; }
function SelectControl({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function moveSelection(offset: number) {
    const index = options.findIndex((option) => option.value === value);
    onChange(options[(index + offset + options.length) % options.length].value);
  }

  return <div ref={controlRef} className={`select-control ${open ? "open" : ""}`}>
    <button type="button" className="select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
      onClick={() => setOpen(!open)} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); moveSelection(event.key === "ArrowDown" ? 1 : -1); setOpen(true); }
        if (event.key === "Escape") setOpen(false);
      }}><span>{selected.label}</span><ChevronDown aria-hidden="true" /></button>
    {open && <div className="select-options" role="listbox" aria-label={label}>{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}
  </div>;
}

function MaximizeWindowIcon() {
  return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="11" height="11" rx="1" /></svg>;
}

function RestoreWindowIcon() {
  return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.5 6.5V4.8c0-.72.58-1.3 1.3-1.3h5.4c.72 0 1.3.58 1.3 1.3v5.4c0 .72-.58 1.3-1.3 1.3h-1.7" /><rect x="3.5" y="6.5" width="8" height="8" rx="1" /></svg>;
}
