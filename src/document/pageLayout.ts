import type { CSSProperties } from "react";

export type PaperSize = "a4" | "letter" | "legal" | "a5";
export type PageOrientation = "portrait" | "landscape";
export type PageViewMode = "document" | "web";
export type DocumentFont = "georgia" | "cambria" | "calibri" | "arial" | "timesNewRoman";

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageLayout {
  paperSize: PaperSize;
  orientation: PageOrientation;
  fontFamily: DocumentFont;
  margins: PageMargins;
}

export type MarginPreset = "normal" | "narrow" | "moderate" | "wide" | "custom";

export const paperSizes: readonly PaperSize[] = ["a4", "letter", "legal", "a5"];
export const documentFonts: readonly DocumentFont[] = [
  "georgia",
  "cambria",
  "calibri",
  "arial",
  "timesNewRoman",
];

const documentFontStacks: Record<DocumentFont, string> = {
  georgia: 'Georgia, "Times New Roman", serif',
  cambria: 'Cambria, Georgia, "Times New Roman", serif',
  calibri: 'Calibri, "Segoe UI", Arial, sans-serif',
  arial: 'Arial, "Segoe UI", sans-serif',
  timesNewRoman: '"Times New Roman", Times, serif',
};

export const marginPresets: Record<Exclude<MarginPreset, "custom">, PageMargins> = {
  normal: { top: 20, right: 20, bottom: 20, left: 20 },
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  moderate: { top: 25.4, right: 19.1, bottom: 25.4, left: 19.1 },
  wide: { top: 25.4, right: 31.8, bottom: 25.4, left: 31.8 },
};

export const defaultPageLayout: PageLayout = {
  paperSize: "a4",
  orientation: "portrait",
  fontFamily: "georgia",
  margins: { ...marginPresets.normal },
};

const storageKey = "med.pageLayout";
const paperDimensions: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  a5: { width: 148, height: 210 },
};

function finiteMargin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 5 && value <= 60;
}

export function pageDimensionsMm(layout: PageLayout) {
  const dimensions = paperDimensions[layout.paperSize];
  return layout.orientation === "landscape"
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
}

export function isValidPageLayout(value: unknown): value is PageLayout {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PageLayout>;
  if (!paperSizes.includes(candidate.paperSize as PaperSize)) return false;
  if (candidate.orientation !== "portrait" && candidate.orientation !== "landscape") return false;
  if (!documentFonts.includes(candidate.fontFamily as DocumentFont)) return false;
  const margins = candidate.margins;
  if (!margins || !finiteMargin(margins.top) || !finiteMargin(margins.right)
    || !finiteMargin(margins.bottom) || !finiteMargin(margins.left)) return false;
  const { width, height } = pageDimensionsMm(candidate as PageLayout);
  return margins.left + margins.right <= width - 40
    && margins.top + margins.bottom <= height - 40;
}

export function loadPageLayout(): PageLayout {
  if (typeof localStorage === "undefined") return defaultPageLayout;
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return defaultPageLayout;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return defaultPageLayout;
    const migrated = {
      fontFamily: defaultPageLayout.fontFamily,
      ...(parsed as Record<string, unknown>),
    };
    return isValidPageLayout(migrated) ? migrated : defaultPageLayout;
  } catch {
    return defaultPageLayout;
  }
}

export function savePageLayout(layout: PageLayout): void {
  if (typeof localStorage !== "undefined" && isValidPageLayout(layout)) {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  }
}

export function marginPresetFor(margins: PageMargins): MarginPreset {
  const match = Object.entries(marginPresets).find(([, preset]) =>
    (["top", "right", "bottom", "left"] as const).every(
      (side) => Math.abs(preset[side] - margins[side]) < 0.05,
    ));
  return (match?.[0] as MarginPreset | undefined) ?? "custom";
}

export function pageLayoutStyle(layout: PageLayout): CSSProperties {
  const { width, height } = pageDimensionsMm(layout);
  return {
    "--med-page-width": `${width}mm`,
    "--med-page-height": `${height}mm`,
    "--med-page-margin-top": `${layout.margins.top}mm`,
    "--med-page-margin-right": `${layout.margins.right}mm`,
    "--med-page-margin-bottom": `${layout.margins.bottom}mm`,
    "--med-page-margin-left": `${layout.margins.left}mm`,
    "--med-document-font": documentFontStacks[layout.fontFamily],
  } as CSSProperties;
}

export function documentFontStack(font: DocumentFont): string {
  return documentFontStacks[font];
}
