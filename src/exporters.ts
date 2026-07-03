import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { renderMarkdown } from "./markdown";

export async function exportHtml(title: string, markdown: string) {
  const path = await save({ defaultPath: title.replace(/\.md$/i, ".html"), filters: [{ name: "HTML", extensions: ["html"] }] });
  if (!path) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{font:16px/1.65 system-ui;max-width:820px;margin:48px auto;padding:0 24px;color:#20242c}pre{padding:16px;background:#f4f5f7;overflow:auto;border-radius:8px}code{font-family:ui-monospace,monospace}blockquote{border-left:3px solid #7657f5;margin-left:0;padding-left:18px;color:#596070}img{max-width:100%}table{border-collapse:collapse}th,td{border:1px solid #d7dae0;padding:8px 12px}</style></head><body>${renderMarkdown(markdown)}</body></html>`;
  await invoke("write_document", { path, content: html });
}

export async function exportDocx(title: string, markdown: string) {
  const path = await save({ defaultPath: title.replace(/\.md$/i, ".docx"), filters: [{ name: "Word", extensions: ["docx"] }] });
  if (!path) return;
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  const children = markdown.split("\n").map((line) => {
    const h = /^(#{1,6})\s+(.+)/.exec(line);
    if (h) return new Paragraph({ text: h[2], heading: heading[h[1].length - 1] });
    const bullet = /^[-*+]\s+(.+)/.exec(line);
    if (bullet) return new Paragraph({ children: inlineRuns(bullet[1], TextRun), bullet: { level: 0 } });
    const number = /^\d+[.)]\s+(.+)/.exec(line);
    if (number) return new Paragraph({ children: inlineRuns(number[1], TextRun), numbering: { reference: "med-numbering", level: 0 } });
    const quote = /^>\s?(.*)/.exec(line);
    return new Paragraph({ children: inlineRuns(quote ? quote[1] : line, TextRun), indent: quote ? { left: 360 } : undefined });
  });
  const document = new Document({ numbering: { config: [{ reference: "med-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }] }] }, sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(document);
  const data = new Uint8Array(await blob.arrayBuffer());
  await invoke("write_binary", { path, data: Array.from(data) });
}

function inlineRuns(value: string, TextRunClass: typeof import("docx").TextRun) {
  const parts = value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith("**")) return new TextRunClass({ text: part.slice(2, -2), bold: true });
    if (part.startsWith("*")) return new TextRunClass({ text: part.slice(1, -1), italics: true });
    if (part.startsWith("`")) return new TextRunClass({ text: part.slice(1, -1), font: "Consolas" });
    return new TextRunClass(part);
  });
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
