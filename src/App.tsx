import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/editor.css";
import { Button } from "./components/Button";
import { ExportDialog } from "./components/ExportDialog";
import { Splitter } from "./components/Splitter";
import { TitleBar } from "./components/TitleBar";
import { Toolbar } from "./components/Toolbar";
import { useWindowManager } from "./components/WindowManager";
import { MarkdownPreview } from "./editor/MarkdownPreview";
import {
  RichEditor,
  type EditorSelectionState,
  type RichEditorHandle,
} from "./editor/RichEditor";
import { canonicalizeMarkdown } from "./editor/markdown";
import { useI18n } from "./i18n";
import {
  chooseMarkdownPath,
  fileNameFromPath,
  openMarkdownFile,
  saveMarkdownFile,
} from "./platform/files";
import { useTheme } from "./platform/theme";
import { platformWindow } from "./platform/window";
import {
  chooseExportPath,
  exportDocument,
  type ExportOptions,
} from "./platform/export";

type WorkspaceMode = "visual" | "source";

const initialSelection: EditorSelectionState = {
  block: "paragraph",
  bold: false,
  italic: false,
  link: false,
};

function LinkDialogContent({
  onCancel,
  onInsert,
  label,
  placeholder,
  cancelLabel,
  insertLabel,
}: {
  onCancel: () => void;
  onInsert: (url: string) => void;
  label: string;
  placeholder: string;
  cancelLabel: string;
  insertLabel: string;
}) {
  const [url, setUrl] = useState("https://");
  const submit = () => {
    if (url.trim()) onInsert(url.trim());
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="field">
        <span>{label}</span>
        <input
          data-autofocus
          value={url}
          placeholder={placeholder}
          onChange={(event) => setUrl(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          inputMode="url"
        />
      </label>
      <div className="dialog__actions">
        <Button type="button" onClick={onCancel}>{cancelLabel}</Button>
        <Button type="submit" variant="primary" disabled={!url.trim()}>{insertLabel}</Button>
      </div>
    </form>
  );
}

type PreferencesSection = "general" | "about";

function PreferencesDialogTitle() {
  const { t } = useI18n();
  return <>{t("settings.title")}</>;
}

function PreferencesDialogContent({ onClose }: { onClose: () => void }) {
  const { locale, setLocale, t } = useI18n();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [section, setSection] = useState<PreferencesSection>("general");

  return (
    <div className="preferences">
      <div className="preferences__body">
        <nav className="preferences__navigation" aria-label={t("settings.sections")}>
          <button
            data-autofocus
            className={section === "general" ? "is-selected" : ""}
            aria-current={section === "general" ? "page" : undefined}
            onClick={() => setSection("general")}
          >
            {t("settings.general")}
          </button>
          <button
            className={section === "about" ? "is-selected" : ""}
            aria-current={section === "about" ? "page" : undefined}
            onClick={() => setSection("about")}
          >
            {t("dialog.about.title")}
          </button>
        </nav>

        <section className="preferences__section">
          {section === "general" ? (
            <>
              <header className="preferences__section-header">
                <h3>{t("settings.general")}</h3>
                <p>{t("settings.general.description")}</p>
              </header>
              <div className="preferences__settings">
                <label className="preference-row">
                  <span className="preference-row__text">
                    <strong>{t("settings.theme")}</strong>
                    <small>{t("settings.theme.description")}</small>
                  </span>
                  <select
                    value={theme}
                    onChange={(event) =>
                      setTheme(event.target.value as "system" | "light" | "dark")
                    }
                  >
                    <option value="system">{t("settings.theme.system")}</option>
                    <option value="light">{t("settings.theme.light")}</option>
                    <option value="dark">{t("settings.theme.dark")}</option>
                  </select>
                </label>
                <label className="preference-row">
                  <span className="preference-row__text">
                    <strong>{t("settings.language")}</strong>
                    <small>{t("settings.language.description")}</small>
                  </span>
                  <select
                    value={locale}
                    onChange={(event) => setLocale(event.target.value as "en" | "es")}
                  >
                    <option value="en">{t("settings.language.english")}</option>
                    <option value="es">{t("settings.language.spanish")}</option>
                  </select>
                </label>
              </div>
            </>
          ) : (
            <div className="about-dialog preferences__about">
              <div className="about-dialog__identity">
                <span className="about-dialog__mark" aria-hidden="true">M</span>
                <div>
                  <strong>{t("app.name")}</strong>
                  <span>{t("app.description")}</span>
                </div>
              </div>
              <div className="about-dialog__details">
                <span>{t("dialog.about.version", { version: "0.1.0" })}</span>
                <span>{t("dialog.about.creator")}</span>
                <span>{t("dialog.about.license")}</span>
              </div>
            </div>
          )}
        </section>
      </div>
      <div className="preferences__footer">
        <Button variant="primary" onClick={onClose}>{t("common.close")}</Button>
      </div>
    </div>
  );
}

export default function App() {
  const { t } = useI18n();
  const { showDialog } = useWindowManager();
  const editorRef = useRef<RichEditorHandle>(null);
  const closeRequestInProgressRef = useRef(false);
  const requestCloseRef = useRef<() => Promise<void>>(async () => undefined);
  const dirtyRef = useRef(false);

  const [markdown, setMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>("visual");
  const [selection, setSelection] = useState(initialSelection);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const documentName = fileNameFromPath(filePath, t("app.untitledDocument"));
  const dirty = markdown !== savedMarkdown;
  dirtyRef.current = dirty;

  const showMessage = useCallback(
    async (title: string, message: string) => {
      await showDialog({
        title,
        description: message,
        width: "compact",
        render: ({ close }) => (
          <div className="dialog__actions">
            <Button data-autofocus variant="primary" onClick={() => close()}>
              {t("common.close")}
            </Button>
          </div>
        ),
      });
    },
    [showDialog, t],
  );

  const saveDocument = useCallback(
    async (forceSaveAs = false): Promise<boolean> => {
      setSaving(true);
      try {
        let targetPath = forceSaveAs ? null : filePath;
        if (!targetPath) targetPath = await chooseMarkdownPath(filePath);
        if (!targetPath) return false;

        const canonical = canonicalizeMarkdown(markdown);
        await saveMarkdownFile(targetPath, canonical);
        setMarkdown(canonical);
        setSavedMarkdown(canonical);
        setFilePath(targetPath);
        return true;
      } catch {
        await showMessage(
          t("dialog.saveError.title"),
          t("dialog.saveError.message", { name: documentName }),
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [documentName, filePath, markdown, showMessage, t],
  );

  const ensureCanDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    const answer = await showDialog<"save" | "discard">({
      title: t("dialog.unsavedChanges.title"),
      description: t("dialog.unsavedChanges.message", { name: documentName }),
      closeOnEscape: true,
      render: ({ close }) => (
        <div className="dialog__actions">
          <Button onClick={() => close()}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={() => close("discard")}>
            {t("dialog.unsavedChanges.discard")}
          </Button>
          <Button data-autofocus variant="primary" onClick={() => close("save")}>
            {t("dialog.unsavedChanges.save")}
          </Button>
        </div>
      ),
    });
    if (answer === "discard") return true;
    if (answer === "save") return saveDocument();
    return false;
  }, [documentName, saveDocument, showDialog, t]);

  const newDocument = useCallback(async () => {
    if (!(await ensureCanDiscard())) return;
    setMarkdown("");
    setSavedMarkdown("");
    setFilePath(null);
    setMode("visual");
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [ensureCanDiscard]);

  const openDocument = useCallback(async () => {
    if (!(await ensureCanDiscard())) return;
    try {
      const opened = await openMarkdownFile();
      if (!opened) return;
      setMarkdown(opened.content);
      setSavedMarkdown(opened.content);
      setFilePath(opened.path);
      setMode("visual");
    } catch {
      await showMessage(
        t("dialog.openError.title"),
        t("dialog.openError.message", { name: t("app.untitledDocument") }),
      );
    }
  }, [ensureCanDiscard, showMessage, t]);

  const requestClose = useCallback(async () => {
    if (closeRequestInProgressRef.current) return;
    closeRequestInProgressRef.current = true;
    try {
      if (!(await ensureCanDiscard())) return;
      await platformWindow.destroy();
    } finally {
      closeRequestInProgressRef.current = false;
    }
  }, [ensureCanDiscard]);
  requestCloseRef.current = requestClose;

  const showPreferences = useCallback(async () => {
    await showDialog({
      title: <PreferencesDialogTitle />,
      width: "wide",
      render: ({ close }) => (
        <PreferencesDialogContent onClose={() => close()} />
      ),
    });
  }, [showDialog]);

  const showLinkDialog = useCallback(async () => {
    const url = await showDialog<string>({
      title: t("editor.link"),
      width: "compact",
      render: ({ close }) => (
        <LinkDialogContent
          label={t("dialog.link.url")}
          placeholder="https://example.com"
          cancelLabel={t("common.cancel")}
          insertLabel={t("dialog.link.insert")}
          onCancel={() => close()}
          onInsert={close}
        />
      ),
    });
    if (url) editorRef.current?.setLink(url);
  }, [showDialog, t]);

  const showExportDialog = useCallback(async () => {
    const options = await showDialog<ExportOptions>({
      title: t("export.title"),
      description: t("export.description"),
      width: "wide",
      render: ({ close }) => (
        <ExportDialog t={t} onCancel={() => close()} onExport={close} />
      ),
    });
    if (!options) return;

    const destinationPath = await chooseExportPath(documentName, options.format);
    if (!destinationPath) return;

    setExporting(true);
    try {
      await exportDocument({
        ...options,
        markdown,
        sourcePath: filePath,
        destinationPath,
        title: documentName.replace(/\.(?:md|markdown|mdown|mkd)$/iu, ""),
      });
      await showMessage(t("export.success.title"), t("export.success.message"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await showMessage(t("export.error.title"), t("export.error.message", { detail }));
    } finally {
      setExporting(false);
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }, [documentName, filePath, markdown, showDialog, showMessage, t]);

  useEffect(() => {
    const title = `${documentName}${dirty ? " •" : ""} — MED`;
    void platformWindow.setTitle(title);
  }, [dirty, documentName]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: () => void = () => {};
    void getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void requestCloseRef.current();
    }).then((remove) => {
      unlisten = remove;
    });
    return () => unlisten();
  }, []);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        void newDocument();
      } else if (key === "o") {
        event.preventDefault();
        void openDocument();
      } else if (key === "s") {
        event.preventDefault();
        void saveDocument(event.shiftKey);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [newDocument, openDocument, saveDocument]);

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/u).length : 0;

  return (
    <div className="app-shell">
      <TitleBar documentName={documentName} dirty={dirty} onRequestClose={() => void requestClose()} />
      <Toolbar
        t={t}
        editorRef={editorRef}
        selection={selection}
        mode={mode}
        onNew={() => void newDocument()}
        onOpen={() => void openDocument()}
        onSave={() => void saveDocument()}
        onSaveAs={() => void saveDocument(true)}
        onExport={() => void showExportDialog()}
        onPreferences={() => void showPreferences()}
        onExit={() => void requestClose()}
        onLink={() => void showLinkDialog()}
        onModeChange={setMode}
      />
      <main className="workspace">
        {mode === "visual" ? (
          <div className="document-viewport">
            <article className="document-page">
              <RichEditor
                ref={editorRef}
                value={markdown}
                label={t("editor.document")}
                onChange={setMarkdown}
                onSelectionChange={setSelection}
              />
            </article>
          </div>
        ) : (
          <Splitter
            label={t("source.resizeHandle")}
            left={
              <div className="source-pane">
                <header className="pane-header">{t("source.editor")}</header>
                <textarea
                  className="source-editor"
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  aria-label={t("source.editor")}
                  spellCheck={false}
                />
              </div>
            }
            right={
              <div className="preview-pane">
                <header className="pane-header">{t("source.preview")}</header>
                <div className="preview-scroll">
                  <article className="preview-page">
                    <MarkdownPreview value={markdown} label={t("source.preview")} />
                  </article>
                </div>
              </div>
            }
          />
        )}
      </main>
      <footer className="status-bar">
        <span className={`status-indicator ${dirty ? "is-dirty" : ""}`} />
        <span>{exporting ? t("status.exporting") : saving ? t("status.saving") : dirty ? t("status.unsaved") : t("status.saved")}</span>
        <span className="status-bar__spacer" />
        <span>{t("status.words", { count: wordCount })}</span>
        <span>{t("status.characters", { count: markdown.length })}</span>
        <span>{mode === "visual" ? t("status.mode.visual") : t("status.mode.source")}</span>
      </footer>
    </div>
  );
}
