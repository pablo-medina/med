# MED

MED is a lightweight desktop Markdown editor that makes Markdown documents feel as approachable as documents in a traditional word processor. It combines a polished visual editor with direct source editing and a live preview.

Created by Pablo Medina and released under the [MIT License](LICENSE).

## Stage-one scope

- Create, open, edit, and save Markdown files.
- Save As writes Markdown only.
- A visual editor powered by ProseMirror and styled as a native part of MED.
- View Source mode with Markdown source and preview panels.
- Deterministic Markdown serialization: saving an unchanged document repeatedly produces the same output.
- A custom title bar and desktop-oriented window controls.
- Token-based light and dark themes, with the operating-system preference used when available and dark as the fallback.
- English and neutral, formal Spanish, selected from the operating-system locale with English as the fallback.

Export to PDF, DOCX, and OpenDocument is intentionally outside this stage. Those formats will belong to Export rather than Save or Save As.

## Technology

- Rust and Tauri 2 for the desktop application boundary.
- React and TypeScript for the interface.
- ProseMirror for document editing, selection, history, and clipboard behavior.
- Plain CSS with design tokens for application-owned components and editor styling.

MED does not use a general-purpose component framework or utility CSS framework. This keeps the visual system cohesive and the application footprint understandable.

## Development

Install the current stable Rust toolchain, the platform prerequisites for Tauri 2, and a supported Node.js release. Then run:

```shell
npm install
npm run tauri dev
```

Build the frontend and type-check it with:

```shell
npm run build
```

Create a release application bundle with:

```shell
npm run tauri build
```

Development startup time is not representative of the optimized release build.

## Documentation

- [Architecture](docs/architecture.md)
- [Localization](docs/localization.md)
- [Contributing](CONTRIBUTING.md)

The codebase and project documentation are written in English. User-facing strings must be localized rather than embedded directly in React components.
