import { en } from "./locales/en";

export const supportedLocales = ["en", "es"] as const;

export type Locale = (typeof supportedLocales)[number];
export type TranslationKey = keyof typeof en;
export type TranslationDictionary = Record<TranslationKey, string>;
export type TranslationParams = Readonly<Record<string, string | number>>;
export type Translate = (
  key: TranslationKey,
  params?: TranslationParams,
) => string;
