import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { PageLayout } from "../document/pageLayout";

export type ExportFormat = "pdf" | "docx" | "odt" | "html";

export interface ExportOptions {
  format: ExportFormat;
  includeImages: boolean;
  pageLayout: PageLayout;
}

interface ExportRequest extends ExportOptions {
  exportId: string;
  markdown: string;
  sourcePath: string | null;
  destinationPath: string;
  title: string;
}

const formatDetails: Record<ExportFormat, { extension: string; label: string }> = {
  pdf: { extension: "pdf", label: "PDF" },
  docx: { extension: "docx", label: "Word document" },
  odt: { extension: "odt", label: "OpenDocument Text" },
  html: { extension: "zip", label: "HTML package" },
};

export async function chooseExportPath(
  title: string,
  format: ExportFormat,
): Promise<string | null> {
  if (!isTauri()) return null;
  const detail = formatDetails[format];
  const cleanTitle = title.replace(/\.(?:md|markdown|mdown|mkd)$/iu, "") || "Untitled";
  return save({
    defaultPath: `${cleanTitle}.${detail.extension}`,
    filters: [{ name: detail.label, extensions: [detail.extension] }],
  });
}

export async function exportDocument(request: ExportRequest): Promise<void> {
  if (!isTauri()) return;
  await invoke("export_document", { request });
}

export async function cancelExport(exportId: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("cancel_export", { exportId });
}
