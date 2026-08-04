# Contributing to MED

Thank you for helping improve MED.

## Ground rules

- Write code, comments, commit messages, and documentation in English.
- Put every user-visible string in the localization dictionaries.
- Keep Spanish translations neutral and formal.
- Use design tokens for color, typography, spacing, borders, focus, and elevation. Do not introduce raw component colors when a semantic token applies.
- Preserve desktop interaction conventions and keyboard access.
- Keep Save and Save As limited to Markdown. Other formats belong to Export.
- Keep Markdown serialization deterministic and idempotent.
- Avoid large UI frameworks and dependencies that duplicate existing platform or application capabilities.

## Before submitting a change

Run the frontend checks:

```shell
npm run build
```

Run the Rust checks:

```shell
cargo check --manifest-path src-tauri/Cargo.toml
```

For changes to visual components, review light and dark themes at narrow and wide window sizes. For localized components, review both English and Spanish. Manually verify keyboard focus, menus, dialogs, splitters, and window controls when they are affected.

## Architecture changes

Keep native responsibilities in the Tauri layer and editor interaction in the React and ProseMirror layer. Do not send high-frequency editor transactions through Tauri. New dialogs, popovers, splitters, and windows must follow the surface definitions in [the architecture guide](docs/architecture.md).

## Adding translations

Follow [the localization guide](docs/localization.md). The English dictionary defines the required key set, and TypeScript checks the Spanish dictionary against it.

## Licensing

By contributing, you agree that your contribution may be distributed under the repository's MIT License.
