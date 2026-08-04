import { useSyncExternalStore } from "react";
import { detectSystemLocale } from "./locale";
import { en } from "./locales/en";
import { es } from "./locales/es";
import type {
  Locale,
  Translate,
  TranslationDictionary,
  TranslationKey,
  TranslationParams,
} from "./types";

export type { Locale, Translate, TranslationKey, TranslationParams } from "./types";
export { detectSystemLocale, normalizeLocale } from "./locale";

const dictionaries: Record<Locale, TranslationDictionary> = { en, es };
const listeners = new Set<() => void>();

let currentLocale: Locale = "en";
let initialization: Promise<Locale> | null = null;
const localeStorageKey = "med.locale";

function interpolate(message: string, params?: TranslationParams): string {
  if (!params) {
    return message;
  }

  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

function updateDocumentLanguage(locale: Locale): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(localeStorageKey, locale);
  }
  if (locale === currentLocale) {
    updateDocumentLanguage(locale);
    return;
  }

  currentLocale = locale;
  updateDocumentLanguage(locale);
  listeners.forEach((listener) => listener());
}

export function translate(
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const message = dictionaries[currentLocale][key] ?? en[key];
  return interpolate(message, params);
}

export function initializeI18n(): Promise<Locale> {
  const storedLocale =
    typeof localStorage === "undefined"
      ? null
      : (localStorage.getItem(localeStorageKey) as Locale | null);
  const localePromise =
    storedLocale === "en" || storedLocale === "es"
      ? Promise.resolve(storedLocale)
      : detectSystemLocale();
  initialization ??= localePromise.then((locale) => {
    setLocale(locale);
    return locale;
  });

  return initialization;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useI18n(): { locale: Locale; setLocale: typeof setLocale; t: Translate } {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return { locale, setLocale, t: translate };
}
