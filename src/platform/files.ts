import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const markdownFilters = [
  {
    name: "Markdown",
    extensions: ["md", "markdown", "mdown", "mkd"],
  },
];

export interface OpenedMarkdownFile {
  path: string;
  content: string;
}

export async function openMarkdownFile(): Promise<OpenedMarkdownFile | null> {
  if (!isTauri()) return null;
  const path = await open({
    multiple: false,
    directory: false,
    filters: markdownFilters,
  });
  if (!path) return null;
  return { path, content: await readTextFile(path) };
}

export async function chooseMarkdownPath(
  currentPath?: string | null,
): Promise<string | null> {
  if (!isTauri()) return null;
  return save({
    defaultPath: currentPath ?? "Untitled.md",
    filters: markdownFilters,
  });
}

export async function saveMarkdownFile(path: string, content: string) {
  if (!isTauri()) return;
  await writeTextFile(path, content);
}

export function fileNameFromPath(path: string | null, fallback: string): string {
  if (!path) return fallback;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || fallback;
}
