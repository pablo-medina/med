import type { Locale } from "./types";

const en = {
  newFile: "New", open: "Open", save: "Save", saveAs: "Save as", close: "Close",
  untitled: "Untitled.md", documents: "Documents", outline: "Outline", noOutline: "No headings",
  edit: "Edit", split: "Split", preview: "Preview", export: "Export", printPdf: "Print / PDF",
  exportDocx: "DOCX", exportHtml: "HTML", settings: "Settings", about: "About MED",
  general: "General", settingsSections: "Settings sections", viewMode: "View mode",
  theme: "Theme", language: "Language", fontSize: "Font size", wordWrap: "Word wrap", formatting: "Formatting",
  system: "System", midnight: "Midnight", light: "Light", sepia: "Sepia", english: "English",
  spanish: "Español", spanishArgentina: "Español (Argentina)", minimize: "Minimize", maximize: "Maximize", restore: "Restore",
  closeWindow: "Close window", bold: "Bold", italic: "Italic", heading: "Heading", link: "Link",
  code: "Code", quote: "Quote", bulletedList: "Bulleted list", numberedList: "Numbered list",
  undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select all",
  dropHint: "Drop a Markdown file anywhere", words: "words", characters: "characters", line: "Ln", column: "Col",
  unsavedTitle: "Unsaved changes", unsavedMessage: "Save your changes before closing this document?", discard: "Discard",
  cancel: "Cancel", author: "Pablo Medina", license: "MIT License", openError: "Could not open the document.",
  saveError: "Could not save the document.", exportError: "Could not export the document.", copied: "Copied"
} as const;

const es = {
  newFile: "Nuevo", open: "Abrir", save: "Guardar", saveAs: "Guardar como", close: "Cerrar",
  untitled: "Sin título.md", documents: "Documentos", outline: "Esquema", noOutline: "Sin encabezados",
  edit: "Editar", split: "Dividir", preview: "Vista previa", export: "Exportar", printPdf: "Imprimir / PDF",
  exportDocx: "DOCX", exportHtml: "HTML", settings: "Configuración", about: "Acerca de MED",
  general: "General", settingsSections: "Secciones de configuración", viewMode: "Modo de vista",
  theme: "Tema", language: "Idioma", fontSize: "Tamaño de fuente", wordWrap: "Ajuste de línea", formatting: "Formato",
  system: "Sistema", midnight: "Medianoche", light: "Claro", sepia: "Sepia", english: "English",
  spanish: "Español", spanishArgentina: "Español (Argentina)", minimize: "Minimizar", maximize: "Maximizar", restore: "Restaurar",
  closeWindow: "Cerrar ventana", bold: "Negrita", italic: "Cursiva", heading: "Encabezado", link: "Enlace",
  code: "Código", quote: "Cita", bulletedList: "Lista con viñetas", numberedList: "Lista numerada",
  undo: "Deshacer", redo: "Rehacer", cut: "Cortar", copy: "Copiar", paste: "Pegar", selectAll: "Seleccionar todo",
  dropHint: "Suelta un archivo Markdown en cualquier lugar", words: "palabras", characters: "caracteres", line: "Lín", column: "Col",
  unsavedTitle: "Cambios sin guardar", unsavedMessage: "¿Quieres guardar los cambios antes de cerrar este documento?", discard: "Descartar",
  cancel: "Cancelar", author: "Pablo Medina", license: "Licencia MIT", openError: "No se pudo abrir el documento.",
  saveError: "No se pudo guardar el documento.", exportError: "No se pudo exportar el documento.", copied: "Copiado"
} as const;

const esArgentina = {
  ...es,
  dropHint: "Soltá un archivo Markdown en cualquier lugar",
  unsavedMessage: "¿Querés guardar los cambios antes de cerrar este documento?"
} satisfies Record<keyof typeof en, string>;

const messages = { en, es, "es-AR": esArgentina } as const;

export type MessageKey = keyof typeof en;
export const translate = (locale: Locale, key: MessageKey) => messages[locale][key];
export function inferLocale(value?: string | null): Locale {
  const locale = (value || navigator.language).toLowerCase();
  if (locale === "es-ar" || locale.startsWith("es-ar-")) return "es-AR";
  return locale.startsWith("es") ? "es" : "en";
}
