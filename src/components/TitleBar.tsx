import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import {
  detectPlatform,
  detectPlatformFromNavigator,
  platformWindow,
  type DesktopPlatform,
} from "../platform/window";
import { Icon } from "./Icon";

interface TitleBarProps {
  documentName: string;
  dirty: boolean;
  onRequestClose: () => void;
}

export function TitleBar({ documentName, dirty, onRequestClose }: TitleBarProps) {
  const { t } = useI18n();
  const [desktopPlatform, setDesktopPlatform] = useState<DesktopPlatform>(
    detectPlatformFromNavigator,
  );
  const [maximized, setMaximized] = useState(false);

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
    await platformWindow.toggleMaximize();
    setMaximized(await platformWindow.isMaximized());
  };

  return (
    <header className="title-bar" data-platform={desktopPlatform}>
      <div className="title-bar__brand" data-tauri-drag-region>
        <span className="title-bar__mark" aria-hidden="true">M</span>
        <span className="title-bar__app-name">{t("app.name")}</span>
      </div>
      <div
        className="title-bar__drag-region"
        data-tauri-drag-region
        onDoubleClick={() => void toggleMaximize()}
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
