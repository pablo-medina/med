import { locale as getNativeLocale } from "@tauri-apps/plugin-os";
import type { Locale } from "./types";

export function normalizeLocale(value: string | null | undefined): Locale | null {
  const language = value?.trim().toLowerCase().replace("_", "-").split("-")[0];

  if (language === "en" || language === "es") {
    return language;
  }

  return null;
}

function getBrowserLocales(): readonly string[] {
  if (typeof navigator === "undefined") {
    return [];
  }

  const locales = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  return locales.filter(Boolean);
}

export async function detectSystemLocale(): Promise<Locale> {
  try {
    const nativeLocale = normalizeLocale(await getNativeLocale());
    if (nativeLocale) {
      return nativeLocale;
    }
  } catch {
    // The native API is unavailable when the frontend runs outside Tauri.
  }

  for (const locale of getBrowserLocales()) {
    const supportedLocale = normalizeLocale(locale);
    if (supportedLocale) {
      return supportedLocale;
    }
  }

  return "en";
}
