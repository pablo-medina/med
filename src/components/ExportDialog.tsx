import { useState } from "react";
import type { PageLayout } from "../document/pageLayout";
import type { Translate } from "../i18n";
import type { TranslationKey } from "../i18n/types";
import type { ExportFormat, ExportOptions } from "../platform/export";
import { Button } from "./Button";

const formats: ExportFormat[] = ["pdf", "docx", "odt", "html"];

export function ExportProgressDialog({
  t,
  onCancel,
}: {
  t: Translate;
  onCancel: () => Promise<void>;
}) {
  const [canceling, setCanceling] = useState(false);

  const cancel = async () => {
    if (canceling) return;
    setCanceling(true);
    try {
      await onCancel();
    } catch {
      setCanceling(false);
    }
  };

  return (
    <div className="export-progress" role="status" aria-live="polite" aria-busy="true">
      <span className="export-progress__spinner" aria-hidden="true" />
      <p>{t(canceling ? "export.progress.canceling" : "export.progress.status")}</p>
      <div className="dialog__actions export-progress__actions">
        <Button data-autofocus disabled={canceling} onClick={() => void cancel()}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

export function ExportDialog({
  t,
  pageLayout,
  onCancel,
  onExport,
}: {
  t: Translate;
  pageLayout: PageLayout;
  onCancel: () => void;
  onExport: (options: ExportOptions) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [includeImages, setIncludeImages] = useState(true);
  const paginated = format !== "html";

  return (
    <form
      className="export-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        onExport({ format, includeImages, pageLayout });
      }}
    >
      <fieldset className="export-fieldset">
        <legend>{t("export.format")}</legend>
        <div className="export-formats">
          {formats.map((item, index) => (
            <label className={`export-format ${format === item ? "is-selected" : ""}`} key={item}>
              <input
                data-autofocus={index === 0 ? true : undefined}
                type="radio"
                name="export-format"
                value={item}
                checked={format === item}
                onChange={() => setFormat(item)}
              />
              <span>
                <strong>{t(`export.format.${item}` as TranslationKey)}</strong>
                <small>{t(`export.format.${item}.description` as TranslationKey)}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {paginated && (
        <div className="export-control">
          <span>
            <strong>{t("export.paperSize")}</strong>
            <small>{t("export.pageSetup.description")}</small>
          </span>
          <strong className="export-control__value">
            {t(`export.paperSize.${pageLayout.paperSize}` as TranslationKey)} · {t(`pageSetup.orientation.${pageLayout.orientation}` as TranslationKey)} · {t(`pageSetup.font.${pageLayout.fontFamily}` as TranslationKey)}
          </strong>
        </div>
      )}

      <label className="export-control export-control--checkbox">
        <input
          type="checkbox"
          checked={includeImages}
          onChange={(event) => setIncludeImages(event.target.checked)}
        />
        <span>
          <strong>{t("export.includeImages")}</strong>
          <small>{t("export.includeImages.description")}</small>
        </span>
      </label>

      <p className="export-note">{paginated ? t("export.paginationNote") : t("export.htmlNote")}</p>

      <div className="dialog__actions">
        <Button type="button" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary">{t("export.action")}</Button>
      </div>
    </form>
  );
}
