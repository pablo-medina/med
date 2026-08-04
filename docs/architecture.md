# MED Architecture

## Product boundary

MED is a desktop document editor whose native file format is Markdown. Save and Save As never write PDF, DOCX, OpenDocument, or HTML; those formats belong exclusively to the Export workflow.

The application targets Windows, macOS, and Linux. Behavior should remain platform-neutral unless a native convention materially improves the experience on one platform.

## Layers

### Tauri and Rust

The Rust layer owns capabilities that require the desktop boundary: filesystem access, native file dialogs, operating-system information, and window management. Keep commands narrow and return structured errors that the React layer can present through MED's own dialog components.

Filesystem capabilities should be restricted to the paths and operations needed by document workflows. Markdown parsing and presentation do not need unrestricted native access.

### Export pipeline

The Rust export layer parses Markdown into one shared block-and-inline model. PDF, DOCX, ODT, and HTML package generators consume that model so line breaks, headings, lists, links, quotations, code, and images behave consistently across formats.

Paginated formats support A4, Letter, Legal, and A5. Their generators apply explicit margins and flow safeguards: headings stay with following content, body paragraphs use widow control where supported, and figures, quotations, list items, and code blocks avoid splitting when the target format permits it. DOCX images are inline rather than floating to avoid renderer-dependent overlap.

Image collection is optional. When enabled, local paths resolve relative to the source Markdown file, data URLs are decoded, and HTTP or HTTPS images are downloaded with count and size limits. Every resulting format embeds or packages image bytes; exported documents never depend on a temporary cache.

HTML export is a ZIP package containing `index.html`, `assets/styles.css`, and image assets. The page uses the same document typography and hierarchy as the visual editor while remaining independent from MED's application chrome.

### React application shell

The React layer owns the custom title bar, menus, command surfaces, status bar, editor modes, and application dialogs. These are application components, not browser-styled controls. They consume shared color, typography, spacing, motion, border, elevation, and focus tokens.

Window controls invoke Tauri window APIs. The title bar is draggable only in intentionally empty drag regions; buttons, menus, and document controls must remain interactive.

### Document editor

ProseMirror owns rich-document state, selection, undo history, input rules, and clipboard behavior in visual mode. MED owns the schema, commands, key bindings, menus, and every visual style around it. ProseMirror CSS must consume the same application design tokens as the surrounding shell so the editor never appears embedded as a separate product.

The document model has two representations:

1. ProseMirror document state for visual editing.
2. A Markdown string for source editing, preview, and persistence.

Transitions between modes parse or serialize at an explicit boundary. Serialization must be deterministic and idempotent: after the first normalization, repeated saves without edits produce identical Markdown.

Source mode uses a resizable split view. The source pane is editable and the preview pane is not. Its divider is a splitter component, not a dialog or an independent window.

## Document lifecycle

The shell tracks the current path, display name, content, editing mode, and dirty state. A new document has no path. Save delegates to Save As until a path has been selected.

Only a successful filesystem write clears the dirty state. Closing a dirty document or window opens an application modal with Save, Don't Save, and Cancel actions. A failed open or save operation is reported without losing the current document state.

Markdown file filters should include `.md`, `.markdown`, `.mdown`, and `.mkd` for opening. Save and Save As should default to `.md` and must not offer non-Markdown output formats.

## Window and dialog model

MED distinguishes the following surfaces:

- The main window is resizable, minimizable, maximizable, and closable.
- Application dialogs are modal layers owned by the main window. They are not draggable or resizable, trap focus while open, restore focus when closed, and close with Escape only when cancellation is safe.
- Popovers and menus are transient, non-modal surfaces anchored to a command. They close on outside interaction and Escape.
- Splitters resize adjacent panels within the main window and expose keyboard-accessible separator semantics.

All surfaces share the same design tokens and focus treatment. Native dialogs are appropriate only at operating-system boundaries such as choosing a file.

## Themes

Theme values are semantic CSS custom properties rather than component-specific colors. Components should use tokens such as surface, text, border, accent, selection, focus, and elevation roles. A component must not branch on `light` or `dark` to choose raw colors.

At startup, MED follows the operating-system color scheme when it is available. Dark is the deterministic fallback. A user override can select system, light, or dark without changing component implementations.

## Localization

All user-visible text is addressed through semantic translation keys. The English dictionary is the compile-time contract and the Spanish dictionary must implement the complete same key set. System locale detection and the component API are documented in [localization.md](localization.md).

## Accessibility

Commands must remain usable from the keyboard. Icon-only controls require localized accessible names. Focus indicators must be visible in both themes, and modal focus handling must not depend on pointer input. Text and interactive states should meet WCAG AA contrast targets.

## Performance

Optimize and measure release builds. Avoid moving high-frequency editor state through the Rust boundary, and keep the number of runtime UI dependencies small. Parsing and serialization should happen only at document or mode boundaries, not for every paint.
