export type Locale = "en" | "es" | "es-AR";
export type Theme = "midnight" | "light" | "sepia" | "system";
export type ViewMode = "edit" | "split" | "preview";

export interface EditorDocument {
  id: string;
  path: string | null;
  title: string;
  content: string;
  savedContent: string;
}

export interface Settings {
  locale: Locale;
  theme: Theme;
  fontSize: number;
  wordWrap: boolean;
}

export interface AppConfig {
  version: 3;
  settings: Settings;
  view: {
    mode: ViewMode;
    outline: boolean;
  };
}
