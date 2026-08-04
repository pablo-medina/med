import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";

export type DesktopPlatform = "windows" | "macos" | "linux" | "unknown";

export function detectPlatformFromNavigator(): DesktopPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const hint = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (hint.includes("mac")) return "macos";
  if (hint.includes("win")) return "windows";
  if (hint.includes("linux") || hint.includes("x11")) return "linux";
  return "unknown";
}

export async function detectPlatform(): Promise<DesktopPlatform> {
  try {
    const value = await platform();
    if (value === "windows" || value === "macos" || value === "linux") return value;
  } catch {
    // Browser preview has no native platform API.
  }
  return detectPlatformFromNavigator();
}

export const platformWindow = {
  available: isTauri(),
  minimize: async () => {
    if (isTauri()) await getCurrentWindow().minimize();
  },
  toggleMaximize: async () => {
    if (isTauri()) await getCurrentWindow().toggleMaximize();
  },
  isMaximized: async () => (isTauri() ? getCurrentWindow().isMaximized() : false),
  close: async () => {
    if (isTauri()) await getCurrentWindow().close();
  },
  destroy: async () => {
    if (isTauri()) await getCurrentWindow().destroy();
  },
  setTitle: async (title: string) => {
    if (isTauri()) await getCurrentWindow().setTitle(title);
    document.title = title;
  },
  onResize: async (listener: () => void) => {
    if (!isTauri()) return () => undefined;
    return getCurrentWindow().onResized(listener);
  },
};
