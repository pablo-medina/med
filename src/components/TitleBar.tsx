import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  detectPlatform,
  detectPlatformFromNavigator,
  platformWindow,
  type DesktopPlatform,
} from "../platform/window";
import { Icon } from "./Icon";
import { FileMenu } from "./FileMenu";
import { AppLogo } from "./AppLogo";

interface TitleBarProps {
  documentName: string;
  dirty: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onPageSetup: () => void;
  onPreferences: () => void;
  onExit: () => void;
  onRequestClose: () => void;
}

export function TitleBar({
  documentName,
  dirty,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onExport,
  onPageSetup,
  onPreferences,
  onExit,
  onRequestClose,
}: TitleBarProps) {
  const { t } = useI18n();
  const [desktopPlatform, setDesktopPlatform] = useState<DesktopPlatform>(
    detectPlatformFromNavigator,
  );
  const [maximized, setMaximized] = useState(false);
  const maximizeInProgressRef = useRef(false);

  useEffect(() => {
    void detectPlatform().then(setDesktopPlatform);
    const syncMaximized = () => void platformWindow.isMaximized().then(setMaximized);
    syncMaximized();
    let removeListener: () => void = () => {};
    void platformWindow.onResize(syncMaximized).then((unlisten) => {
      removeListener = unlisten;
    });
    return () => removeListener();
  }, []);

  const toggleMaximize = async () => {
    if (maximizeInProgressRef.current) return;
    maximizeInProgressRef.current = true;
    try {
      await platformWindow.toggleMaximize();
      setMaximized(await platformWindow.isMaximized());
    } finally {
      maximizeInProgressRef.current = false;
    }
  };

  return (
    <header className="title-bar" data-platform={desktopPlatform}>
      <div className="title-bar__leading">
        <AppLogo className="title-bar__mark" title={t("app.name")} />
        <FileMenu
          label={t("menu.file")}
          items={[
            { label: t("menu.file.new"), shortcut: "Ctrl+N", action: onNew },
            { label: t("menu.file.open"), shortcut: "Ctrl+O", action: onOpen },
            { separator: true },
            { label: t("menu.file.save"), shortcut: "Ctrl+S", action: onSave },
            { label: t("menu.file.saveAs"), shortcut: "Ctrl+Shift+S", action: onSaveAs },
            { separator: true },
            { label: t("menu.file.export"), action: onExport },
            { label: t("pageSetup.title"), action: onPageSetup },
            { separator: true },
            { label: t("menu.file.preferences"), action: onPreferences },
            { separator: true },
            { label: t("menu.file.exit"), action: onExit },
          ]}
        />
      </div>
      <div
        className="title-bar__drag-region"
        data-tauri-drag-region
      >
        <span className="title-bar__document-name">
          {documentName}
          {dirty && <span className="title-bar__dirty" aria-label={t("status.unsaved")} />}
        </span>
      </div>
      {desktopPlatform !== "macos" && (
        <div className="window-controls">
          <button
            className="window-control"
            aria-label={t("window.minimize")}
            title={t("window.minimize")}
            onClick={() => void platformWindow.minimize()}
          >
            <Icon name="minimize" />
          </button>
          <button
            className="window-control"
            aria-label={maximized ? t("window.restore") : t("window.maximize")}
            title={maximized ? t("window.restore") : t("window.maximize")}
            onClick={() => void toggleMaximize()}
          >
            <Icon name={maximized ? "restore" : "maximize"} />
          </button>
          <button
            className="window-control window-control--close"
            aria-label={t("window.close")}
            title={t("window.close")}
            onClick={onRequestClose}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </header>
  );
}
