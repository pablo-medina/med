# MED Repository Guidelines

## Product

- Product name: MED.
- Author: Pablo Medina.
- License: MIT.
- Use `med` for package, binary, bundle, and executable names.
- Keep all code and documentation in English.

## Architecture

- Use Tauri v2, Rust, React, and TypeScript.
- Keep filesystem and native OS behavior behind narrow Tauri commands.
- Keep document state, rendered preview, persistence, and export concerns separate.
- Centralize application dialogs and window lifecycle behavior.
- Use custom title bars for application windows.

## Performance

- Optimize startup and initial document display.
- Lazy-load export engines and other optional heavy features.
- Keep Markdown rendering off the native command boundary.

## UI

- Keep primary document actions visible and group secondary actions in compact menus.
- Define themes with semantic CSS variables.
- Use Lucide or purpose-built monochrome icons.
- Do not add decorative sections without implemented behavior.
- Keep settings labels concise.

## Localization

- English is the source and fallback locale.
- Add every user-facing string in English, neutral Spanish, and Argentine Spanish.
- Detect the operating-system locale when no preference is stored.

## Native Behavior

- Replace browser context menus with application-owned menus where useful.
- Suppress the browser context menu everywhere else.
- Preserve conventional Windows, Linux, and macOS keyboard shortcuts.
- Verify file associations, printing, custom chrome, and packaging in the native shell.
- Store all preferences and restorable UI state in the native `config.json` file.
- Never use `localStorage` or browser storage for application state.

## Quality

- Run `npm run check`, `npm run build`, `cargo fmt --check`, and `cargo check` before handoff.
- Keep Tauri capabilities narrowly scoped.
- Preserve unsaved work across close and replacement flows.
