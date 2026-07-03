---
name: med-desktop-development
description: Implement and review MED, the Tauri v2, Rust, React, and TypeScript Markdown desktop application. Use for editor, preview, themes, i18n, native windows and dialogs, context menus, printing, document export, file associations, startup performance, packaging, or cross-platform behavior in the MED repository.
---

# MED Desktop Development

1. Read `AGENTS.md` and inspect the affected Rust and React boundaries.
2. Preserve MED naming across package metadata, binary targets, bundle identifiers, window labels, and documentation.
3. Route filesystem and operating-system behavior through focused Tauri commands.
4. Keep editor content, preview rendering, persistence, and export state independent.
5. Add all user-facing strings to English, neutral Spanish, and Argentine Spanish catalogs.
6. Express visual tokens through semantic CSS variables and verify every theme.
7. Lazy-load optional export and other heavy code.
8. Handle unsaved changes for document close, replacement, and window lifecycle events.
9. Suppress the webview context menu unless an application-owned menu is provided.
10. Persist preferences and restorable UI state only through the native `config.json`; never use browser storage.
11. Verify with TypeScript checks, the frontend build, Rust formatting and checks, and native-shell inspection.
