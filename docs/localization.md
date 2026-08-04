# Localization

MED currently supports English (`en`) and neutral, formal Spanish (`es`). English is the source language and the final fallback.

## Locale selection

At startup, MED tries locale sources in this order:

1. A previously selected supported language stored by MED.
2. The native operating-system locale reported by the Tauri OS plugin.
3. `navigator.languages`, or `navigator.language` when the locale list is unavailable.
4. English.

Locale tags are normalized as BCP 47 language tags. Region variants map to their supported base language, so `es-AR`, `es-MX`, and `es_ES` all select `es`. An unsupported locale such as `fr-FR` selects English.

The Tauri application must register `tauri-plugin-os` in Rust as well as installing `@tauri-apps/plugin-os` in the frontend. Browser-only development remains functional because native locale lookup is guarded and falls back to the browser locale.

## Application integration

Initialize localization before rendering the application when avoiding a one-frame English fallback is important:

```tsx
import { initializeI18n } from "./i18n";

async function start() {
  await initializeI18n();
  // Render the React root here.
}

void start();
```

The `I18nProvider` is also available for applications that prefer initialization during the React lifecycle:

```tsx
import { I18nProvider } from "./i18n/I18nProvider";

<I18nProvider>
  <App />
</I18nProvider>
```

Use the typed hook inside components:

```tsx
import { useI18n } from "../i18n";

function SaveButton() {
  const { t } = useI18n();
  return <button>{t("menu.file.save")}</button>;
}
```

Parameters use named placeholders:

```tsx
t("dialog.unsavedChanges.message", { name: documentName });
```

The hook also exposes `locale` and `setLocale`. Do not call `setLocale` for automatic startup selection; `initializeI18n` already performs that work.

## Translation keys

Keys describe meaning and ownership, not English wording. Use dot-separated namespaces:

```text
menu.file.save
editor.bold
dialog.unsavedChanges.title
status.words
```

Do not create keys such as `saveButtonText`, `label1`, or `save_changes_question`. Reuse a key only when the meaning and context are the same in every language. Short identical English strings may still need separate keys when their roles differ.

## Adding or changing text

1. Add the key and English value to `src/i18n/locales/en.ts`.
2. Add the same key to `src/i18n/locales/es.ts`.
3. Use the key through `t()` in the component, including accessible names and tooltips.
4. Run `npm run build`. TypeScript rejects a Spanish dictionary with missing or unknown keys.
5. Review both locales in both light and dark themes. Translated text can change control widths and wrapping.

User-visible error text must also use translation keys. Technical error details may be logged in English, but raw exceptions should not be used as dialog copy.

## Spanish style

Spanish text must be neutral and formal:

- Use standard forms such as “Guardar”, “Seleccione”, and “¿Desea…?”.
- Avoid voseo, regional slang, and locale-specific idioms.
- Prefer established software terminology that is understandable across Spanish-speaking regions.
- Use sentence case for descriptions and title-style capitalization only where the interface convention requires it.

The application name `MED` and format or technology names such as Markdown remain unchanged.
