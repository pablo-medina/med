import { useState } from "react";
import type { Translate } from "../i18n";
import type { TranslationKey } from "../i18n/types";
import type { ExportFormat, ExportOptions, PaperSize } from "../platform/export";
import { Button } from "./Button";

const formats: ExportFormat[] = ["pdf", "docx", "odt", "html"];
const paperSizes: PaperSize[] = ["a4", "letter", "legal", "a5"];

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
  onCancel,
  onExport,
}: {
  t: Translate;
  onCancel: () => void;
  onExport: (options: ExportOptions) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const [includeImages, setIncludeImages] = useState(true);
  const paginated = format !== "html";

  return (
    <form
      className="export-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        onExport({ format, paperSize, includeImages });
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
        <label className="export-control">
          <span>
            <strong>{t("export.paperSize")}</strong>
            <small>{t("export.paperSize.description")}</small>
          </span>
          <select value={paperSize} onChange={(event) => setPaperSize(event.target.value as PaperSize)}>
            {paperSizes.map((size) => <option value={size} key={size}>{t(`export.paperSize.${size}` as TranslationKey)}</option>)}
          </select>
        </label>
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
