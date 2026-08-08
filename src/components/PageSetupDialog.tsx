import { useMemo, useState } from "react";
import type { Translate } from "../i18n";
import type { TranslationKey } from "../i18n/types";
import {
  isValidPageLayout,
  documentFonts,
  documentFontStack,
  marginPresetFor,
  marginPresets,
  pageDimensionsMm,
  paperSizes,
  type MarginPreset,
  type DocumentFont,
  type PageLayout,
  type PageMargins,
  type PageOrientation,
  type PaperSize,
} from "../document/pageLayout";
import { Button } from "./Button";

const marginSides = ["top", "bottom", "left", "right"] as const;
const marginOptions: MarginPreset[] = ["normal", "narrow", "moderate", "wide", "custom"];

export function PageSetupDialog({
  t,
  initialLayout,
  onCancel,
  onApply,
}: {
  t: Translate;
  initialLayout: PageLayout;
  onCancel: () => void;
  onApply: (layout: PageLayout) => void;
}) {
  const [layout, setLayout] = useState<PageLayout>(() => ({
    ...initialLayout,
    margins: { ...initialLayout.margins },
  }));
  const preset = marginPresetFor(layout.margins);
  const dimensions = useMemo(() => pageDimensionsMm(layout), [layout]);
  const valid = isValidPageLayout(layout);

  const setMargins = (margins: PageMargins) => {
    setLayout((current) => ({ ...current, margins: { ...margins } }));
  };

  return (
    <form
      className="page-setup"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onApply(layout);
      }}
    >
      <div className="page-setup__body">
        <div className="page-setup__controls">
          <fieldset className="page-setup__section">
            <legend>{t("pageSetup.paper")}</legend>
            <label className="page-setup__field">
              <span>{t("pageSetup.paperSize")}</span>
              <select
                data-autofocus
                value={layout.paperSize}
                onChange={(event) => setLayout((current) => ({
                  ...current,
                  paperSize: event.target.value as PaperSize,
                }))}
              >
                {paperSizes.map((size) => (
                  <option value={size} key={size}>
                    {t(`export.paperSize.${size}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </label>
            <div className="page-setup__field">
              <span>{t("pageSetup.orientation")}</span>
              <div className="page-setup__orientation" role="group">
                {(["portrait", "landscape"] as PageOrientation[]).map((orientation) => (
                  <button
                    type="button"
                    className={layout.orientation === orientation ? "is-selected" : ""}
                    aria-pressed={layout.orientation === orientation}
                    key={orientation}
                    onClick={() => setLayout((current) => ({ ...current, orientation }))}
                  >
                    <span className={`page-orientation-icon page-orientation-icon--${orientation}`} />
                    {t(`pageSetup.orientation.${orientation}` as TranslationKey)}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset className="page-setup__section">
            <legend>{t("pageSetup.margins")}</legend>
            <label className="page-setup__field">
              <span>{t("pageSetup.marginPreset")}</span>
              <select
                value={preset}
                onChange={(event) => {
                  const next = event.target.value as MarginPreset;
                  if (next !== "custom") setMargins(marginPresets[next]);
                }}
              >
                {marginOptions.map((option) => (
                  <option value={option} key={option}>
                    {t(`pageSetup.marginPreset.${option}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </label>
            <div className="page-setup__margin-grid">
              {marginSides.map((side) => (
                <label key={side}>
                  <span>{t(`pageSetup.margin.${side}` as TranslationKey)}</span>
                  <span className="page-setup__number">
                    <input
                      type="number"
                      min="5"
                      max="60"
                      step="0.1"
                      value={layout.margins[side]}
                      onChange={(event) => setMargins({
                        ...layout.margins,
                        [side]: Number(event.target.value),
                      })}
                      aria-invalid={!valid}
                    />
                    <span>mm</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="page-setup__section">
            <legend>{t("pageSetup.typography")}</legend>
            <label className="page-setup__field">
              <span>{t("pageSetup.documentFont")}</span>
              <select
                value={layout.fontFamily}
                onChange={(event) => setLayout((current) => ({
                  ...current,
                  fontFamily: event.target.value as DocumentFont,
                }))}
              >
                {documentFonts.map((font) => (
                  <option value={font} key={font}>
                    {t(`pageSetup.font.${font}` as TranslationKey)}
                  </option>
                ))}
              </select>
              <small>{t("pageSetup.documentFont.description")}</small>
            </label>
          </fieldset>
        </div>

        <aside className="page-setup__preview" aria-label={t("pageSetup.preview") }>
          <div
            className="page-setup__sheet"
            style={{
              aspectRatio: `${dimensions.width} / ${dimensions.height}`,
              fontFamily: documentFontStack(layout.fontFamily),
            }}
          >
            <div
              className="page-setup__print-area"
              style={{
                top: `${layout.margins.top / dimensions.height * 100}%`,
                right: `${layout.margins.right / dimensions.width * 100}%`,
                bottom: `${layout.margins.bottom / dimensions.height * 100}%`,
                left: `${layout.margins.left / dimensions.width * 100}%`,
              }}
            >
              <strong className="page-setup__font-sample">Aa</strong>
              {Array.from({ length: 9 }, (_, index) => <span key={index} />)}
            </div>
          </div>
          <strong>{t("pageSetup.preview")}</strong>
          <span>{dimensions.width} × {dimensions.height} mm</span>
        </aside>
      </div>

      {!valid && <p className="page-setup__error">{t("pageSetup.invalidMargins")}</p>}
      <div className="dialog__actions">
        <Button type="button" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={!valid}>{t("pageSetup.apply")}</Button>
      </div>
    </form>
  );
}
