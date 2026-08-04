use base64::Engine;
use docx_rs::*;
use printpdf::{Base64OrRaw, GeneratePdfOptions, PdfDocument, PdfSaveOptions};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use thiserror::Error;
use zip::write::SimpleFileOptions;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_IMAGES: usize = 64;

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    markdown: String,
    source_path: Option<String>,
    destination_path: String,
    format: ExportFormat,
    paper_size: PaperSize,
    include_images: bool,
    title: String,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum ExportFormat {
    Pdf,
    Docx,
    Odt,
    Html,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum PaperSize {
    A4,
    Letter,
    Legal,
    A5,
}

impl PaperSize {
    fn millimeters(self) -> (f32, f32) {
        match self {
            Self::A4 => (210.0, 297.0),
            Self::Letter => (215.9, 279.4),
            Self::Legal => (215.9, 355.6),
            Self::A5 => (148.0, 210.0),
        }
    }

    fn twips(self) -> (u32, u32) {
        match self {
            Self::A4 => (11_906, 16_838),
            Self::Letter => (12_240, 15_840),
            Self::Legal => (12_240, 20_160),
            Self::A5 => (8_391, 11_906),
        }
    }

    fn code_columns(self) -> usize {
        match self {
            Self::A4 => 82,
            Self::Letter | Self::Legal => 86,
            Self::A5 => 54,
        }
    }
}

#[derive(Debug, Error)]
enum ExportError {
    #[error("The destination folder is not available.")]
    MissingDestination,
    #[error("Could not read image {0}: {1}")]
    Image(String, String),
    #[error("The document contains more than {MAX_IMAGES} images.")]
    TooManyImages,
    #[error("Could not generate PDF: {0}")]
    Pdf(String),
    #[error("Could not generate DOCX: {0}")]
    Docx(String),
    #[error("Could not create document package: {0}")]
    Package(String),
    #[error("Could not write the exported file: {0}")]
    Write(#[from] std::io::Error),
}

#[derive(Clone, Default)]
struct TextStyle {
    bold: bool,
    italic: bool,
    code: bool,
    link: Option<String>,
}

#[derive(Clone)]
enum Inline {
    Text(String, TextStyle),
    Break,
    Image { source: String, alt: String },
}

#[derive(Clone)]
enum BlockKind {
    Paragraph,
    Heading(u8),
    Quote,
    Code,
    ListItem { ordered: bool, level: usize },
    Rule,
}

#[derive(Clone)]
struct Block {
    kind: BlockKind,
    inlines: Vec<Inline>,
}

struct ImageAsset {
    key: String,
    file_name: String,
    bytes: Vec<u8>,
    width: u32,
    height: u32,
    media_type: &'static str,
}

struct ExportDocument {
    title: String,
    blocks: Vec<Block>,
    images: HashMap<String, ImageAsset>,
}

fn heading_number(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn parse_blocks(markdown: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut current: Option<Block> = None;
    let mut style = TextStyle::default();
    let mut lists: Vec<bool> = Vec::new();
    let mut quote_depth = 0usize;
    let mut image: Option<(String, String)> = None;

    let finish = |current: &mut Option<Block>, blocks: &mut Vec<Block>| {
        if let Some(block) = current.take() {
            blocks.push(block);
        }
    };

    let options =
        Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS;
    for event in Parser::new_ext(markdown, options) {
        match event {
            Event::Start(Tag::Paragraph) => {
                if current.is_none() {
                    let kind = if let Some(ordered) = lists.last() {
                        BlockKind::ListItem {
                            ordered: *ordered,
                            level: lists.len().saturating_sub(1),
                        }
                    } else if quote_depth > 0 {
                        BlockKind::Quote
                    } else {
                        BlockKind::Paragraph
                    };
                    current = Some(Block {
                        kind,
                        inlines: Vec::new(),
                    });
                }
            }
            Event::Start(Tag::Heading { level, .. }) => {
                finish(&mut current, &mut blocks);
                current = Some(Block {
                    kind: BlockKind::Heading(heading_number(level)),
                    inlines: Vec::new(),
                });
            }
            Event::Start(Tag::BlockQuote(_)) => quote_depth += 1,
            Event::Start(Tag::CodeBlock(_)) => {
                finish(&mut current, &mut blocks);
                current = Some(Block {
                    kind: BlockKind::Code,
                    inlines: Vec::new(),
                });
                style.code = true;
            }
            Event::Start(Tag::List(start)) => lists.push(start.is_some()),
            Event::Start(Tag::Item) => {
                finish(&mut current, &mut blocks);
                current = Some(Block {
                    kind: BlockKind::ListItem {
                        ordered: *lists.last().unwrap_or(&false),
                        level: lists.len().saturating_sub(1),
                    },
                    inlines: Vec::new(),
                });
            }
            Event::Start(Tag::Strong) => style.bold = true,
            Event::Start(Tag::Emphasis) => style.italic = true,
            Event::Start(Tag::Link { dest_url, .. }) => style.link = Some(dest_url.into_string()),
            Event::Start(Tag::Image { dest_url, .. }) => {
                image = Some((dest_url.into_string(), String::new()))
            }
            Event::Text(text) => {
                if let Some((_, alt)) = image.as_mut() {
                    alt.push_str(&text);
                } else {
                    if current.is_none() {
                        let kind = if let Some(ordered) = lists.last() {
                            BlockKind::ListItem {
                                ordered: *ordered,
                                level: lists.len().saturating_sub(1),
                            }
                        } else if quote_depth > 0 {
                            BlockKind::Quote
                        } else {
                            BlockKind::Paragraph
                        };
                        current = Some(Block {
                            kind,
                            inlines: Vec::new(),
                        });
                    }
                    current
                        .as_mut()
                        .unwrap()
                        .inlines
                        .push(Inline::Text(text.into_string(), style.clone()));
                }
            }
            Event::Code(text) => {
                if let Some((_, alt)) = image.as_mut() {
                    alt.push_str(&text);
                } else {
                    if current.is_none() {
                        current = Some(Block {
                            kind: BlockKind::Paragraph,
                            inlines: Vec::new(),
                        });
                    }
                    let mut applied = style.clone();
                    applied.code = true;
                    current
                        .as_mut()
                        .unwrap()
                        .inlines
                        .push(Inline::Text(text.into_string(), applied));
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some(block) = current.as_mut() {
                    block.inlines.push(Inline::Break);
                }
            }
            Event::Rule => {
                finish(&mut current, &mut blocks);
                blocks.push(Block {
                    kind: BlockKind::Rule,
                    inlines: Vec::new(),
                });
            }
            Event::TaskListMarker(checked) => {
                if let Some(block) = current.as_mut() {
                    block.inlines.push(Inline::Text(
                        if checked { "☒ " } else { "☐ " }.into(),
                        TextStyle::default(),
                    ));
                }
            }
            Event::End(TagEnd::Image) => {
                if let Some((source, alt)) = image.take() {
                    if current.is_none() {
                        current = Some(Block {
                            kind: BlockKind::Paragraph,
                            inlines: Vec::new(),
                        });
                    }
                    current
                        .as_mut()
                        .unwrap()
                        .inlines
                        .push(Inline::Image { source, alt });
                }
            }
            Event::End(
                TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::CodeBlock | TagEnd::Item,
            ) => finish(&mut current, &mut blocks),
            Event::End(TagEnd::BlockQuote(_)) => quote_depth = quote_depth.saturating_sub(1),
            Event::End(TagEnd::List(_)) => {
                lists.pop();
            }
            Event::End(TagEnd::Strong) => style.bold = false,
            Event::End(TagEnd::Emphasis) => style.italic = false,
            Event::End(TagEnd::Link) => style.link = None,
            Event::End(_)
            | Event::Html(_)
            | Event::InlineHtml(_)
            | Event::FootnoteReference(_)
            | Event::InlineMath(_)
            | Event::DisplayMath(_) => {}
            _ => {}
        }
    }
    finish(&mut current, &mut blocks);
    blocks
}

fn image_sources(blocks: &[Block]) -> Vec<String> {
    let mut found = Vec::new();
    for block in blocks {
        for inline in &block.inlines {
            if let Inline::Image { source, .. } = inline {
                if !found.contains(source) {
                    found.push(source.clone());
                }
            }
        }
    }
    found
}

fn load_image(source: &str, source_path: Option<&str>) -> Result<Vec<u8>, ExportError> {
    if let Some(data) = source.strip_prefix("data:image/") {
        let (_, encoded) = data
            .split_once(',')
            .ok_or_else(|| ExportError::Image(source.into(), "invalid data URL".into()))?;
        return base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| ExportError::Image(source.into(), error.to_string()));
    }
    if source.starts_with("http://") || source.starts_with("https://") {
        let mut response = ureq::get(source)
            .call()
            .map_err(|error| ExportError::Image(source.into(), error.to_string()))?;
        return response
            .body_mut()
            .with_config()
            .limit(MAX_IMAGE_BYTES as u64)
            .read_to_vec()
            .map_err(|error| ExportError::Image(source.into(), error.to_string()));
    }

    let decoded = url::Url::parse(source).ok().and_then(|url| {
        if url.scheme() == "file" {
            url.to_file_path().ok()
        } else {
            None
        }
    });
    let path = decoded.unwrap_or_else(|| {
        let candidate = PathBuf::from(source);
        if candidate.is_absolute() {
            candidate
        } else {
            source_path
                .and_then(|path| Path::new(path).parent())
                .unwrap_or_else(|| Path::new("."))
                .join(candidate)
        }
    });
    let bytes =
        fs::read(&path).map_err(|error| ExportError::Image(source.into(), error.to_string()))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ExportError::Image(
            source.into(),
            "image is larger than 10 MB".into(),
        ));
    }
    Ok(bytes)
}

fn resolve_images(
    blocks: &[Block],
    source_path: Option<&str>,
    include: bool,
) -> Result<HashMap<String, ImageAsset>, ExportError> {
    if !include {
        return Ok(HashMap::new());
    }
    let sources = image_sources(blocks);
    if sources.len() > MAX_IMAGES {
        return Err(ExportError::TooManyImages);
    }
    let mut result = HashMap::new();
    for (index, source) in sources.iter().enumerate() {
        let bytes = load_image(source, source_path)?;
        let format = image::guess_format(&bytes)
            .map_err(|error| ExportError::Image(source.clone(), error.to_string()))?;
        let decoded = image::load_from_memory(&bytes)
            .map_err(|error| ExportError::Image(source.clone(), error.to_string()))?;
        let (extension, media_type) = match format {
            image::ImageFormat::Jpeg => ("jpg", "image/jpeg"),
            image::ImageFormat::Gif => ("gif", "image/gif"),
            image::ImageFormat::WebP => ("webp", "image/webp"),
            image::ImageFormat::Bmp => ("bmp", "image/bmp"),
            _ => ("png", "image/png"),
        };
        let file_name = format!("image-{}.{}", index + 1, extension);
        result.insert(
            source.clone(),
            ImageAsset {
                key: format!("assets/images/{file_name}"),
                file_name,
                bytes,
                width: decoded.width(),
                height: decoded.height(),
                media_type,
            },
        );
    }
    Ok(result)
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn html_body(document: &ExportDocument, pdf_code_columns: Option<usize>) -> String {
    let mut html = String::new();
    let mut list: Option<(bool, usize)> = None;
    let close_list = |html: &mut String, list: &mut Option<(bool, usize)>| {
        if let Some((ordered, _)) = list.take() {
            html.push_str(if ordered { "</ol>" } else { "</ul>" });
        }
    };
    for block in &document.blocks {
        if let BlockKind::ListItem { ordered, level } = block.kind {
            if list != Some((ordered, level)) {
                close_list(&mut html, &mut list);
                html.push_str(if ordered { "<ol>" } else { "<ul>" });
                list = Some((ordered, level));
            }
            html.push_str("<li>");
            html.push_str(&inline_html(&block.inlines, &document.images, false));
            html.push_str("</li>");
            continue;
        }
        close_list(&mut html, &mut list);
        let content = inline_html(
            &block.inlines,
            &document.images,
            matches!(block.kind, BlockKind::Heading(_)),
        );
        match block.kind {
            BlockKind::Paragraph => html.push_str(&format!("<p>{content}</p>")),
            BlockKind::Heading(level) => html.push_str(&format!("<h{level}>{content}</h{level}>")),
            BlockKind::Quote => {
                if pdf_code_columns.is_some() {
                    html.push_str(&format!("<p class=\"pdf-quote\">{content}</p>"));
                } else {
                    html.push_str(&format!("<blockquote><p>{content}</p></blockquote>"));
                }
            }
            BlockKind::Code => {
                if let Some(columns) = pdf_code_columns {
                    html.push_str(&pdf_code_block_html(block, columns));
                } else {
                    html.push_str(&format!("<pre><code>{content}</code></pre>"));
                }
            }
            BlockKind::Rule => html.push_str("<hr>"),
            BlockKind::ListItem { .. } => unreachable!(),
        }
    }
    close_list(&mut html, &mut list);
    html
}

fn code_block_text(block: &Block) -> String {
    let mut text = String::new();
    for inline in &block.inlines {
        match inline {
            Inline::Text(value, _) => text.push_str(value),
            Inline::Break => text.push('\n'),
            Inline::Image { alt, .. } => text.push_str(alt),
        }
    }
    text
}

fn wrap_code_line(line: &str, columns: usize) -> Vec<String> {
    let characters = line.chars().collect::<Vec<_>>();
    if characters.is_empty() {
        return vec![String::new()];
    }
    let columns = columns.max(1);
    let mut wrapped = Vec::new();
    let mut start = 0usize;
    while characters.len().saturating_sub(start) > columns {
        let hard_end = (start + columns).min(characters.len());
        let preferred_start = start + columns / 2;
        let split = (preferred_start..hard_end)
            .rev()
            .find(|index| {
                matches!(
                    characters[*index],
                    ' ' | '\t' | ',' | ';' | ':' | ')' | ']' | '}'
                )
            })
            .map(|index| index + 1)
            .unwrap_or(hard_end);
        wrapped.push(characters[start..split].iter().collect());
        start = split;
    }
    wrapped.push(characters[start..].iter().collect());
    wrapped
}

fn pdf_code_line_html(line: &str) -> String {
    if line.is_empty() {
        return "<span class=\"pdf-code-blank\">.</span>".to_string();
    }

    let mut html = String::new();
    let mut text = String::new();
    let flush_text = |html: &mut String, text: &mut String| {
        if !text.is_empty() {
            html.push_str(&escape_html(text));
            text.clear();
        }
    };
    let mut spaces = 0usize;
    for character in line.chars() {
        if character == ' ' || character == '\t' {
            flush_text(&mut html, &mut text);
            spaces += if character == '\t' { 4 } else { 1 };
        } else {
            if spaces > 0 {
                html.push_str(&format!(
                    "<span class=\"pdf-code-space\" style=\"width:{:.2}em\"></span>",
                    spaces as f32 * 0.62
                ));
                spaces = 0;
            }
            text.push(character);
        }
    }
    flush_text(&mut html, &mut text);
    if spaces > 0 {
        html.push_str(&format!(
            "<span class=\"pdf-code-space\" style=\"width:{:.2}em\"></span>",
            spaces as f32 * 0.62
        ));
    }
    html
}

fn pdf_code_block_html(block: &Block, columns: usize) -> String {
    let source = code_block_text(block);
    let mut lines = source
        .lines()
        .flat_map(|line| wrap_code_line(line, columns))
        .collect::<Vec<_>>();
    if source.ends_with('\n') {
        lines.push(String::new());
    }
    if lines.is_empty() {
        lines.push(String::new());
    }

    let last = lines.len().saturating_sub(1);
    let mut html = String::new();
    for (index, line) in lines.iter().enumerate() {
        let position = match (index == 0, index == last) {
            (true, true) => " is-first is-last",
            (true, false) => " is-first",
            (false, true) => " is-last",
            (false, false) => "",
        };
        html.push_str(&format!(
            "<div class=\"pdf-code-line{position}\">{}</div>",
            pdf_code_line_html(line)
        ));
    }
    html
}

fn inline_html(
    inlines: &[Inline],
    images: &HashMap<String, ImageAsset>,
    nonbreaking_spaces: bool,
) -> String {
    let mut html = String::new();
    for inline in inlines {
        match inline {
            Inline::Break => html.push_str("<br>"),
            Inline::Image { source, alt } => {
                if let Some(asset) = images.get(source) {
                    html.push_str(&format!("<figure><img src=\"{}\" alt=\"{}\" width=\"{}\" height=\"{}\" style=\"width:{}px;height:{}px\"><figcaption>{}</figcaption></figure>", escape_html(&asset.key), escape_html(alt), asset.width, asset.height, asset.width, asset.height, escape_html(alt)));
                } else if !alt.is_empty() {
                    html.push_str(&format!(
                        "<span class=\"image-alt\">{}</span>",
                        escape_html(alt)
                    ));
                }
            }
            Inline::Text(text, style) => {
                let mut value = escape_html(text);
                if nonbreaking_spaces {
                    value = value.replace(' ', "<span class=\"heading-space\"></span>");
                }
                if style.code {
                    value = format!("<code>{value}</code>");
                }
                if style.italic {
                    value = format!("<em>{value}</em>");
                }
                if style.bold {
                    value = format!("<strong>{value}</strong>");
                }
                if let Some(link) = &style.link {
                    value = format!("<a href=\"{}\">{value}</a>", escape_html(link));
                }
                html.push_str(&value);
            }
        }
    }
    html
}

const DOCUMENT_CSS: &str = r#"
:root{color-scheme:light;--ink:#20252b;--muted:#626b78;--accent:#315fc7;--line:#d6dae0;--paper:#fff;--code:#f3f5f7}
*{box-sizing:border-box}html{background:#eef1f4}body{max-width:860px;margin:40px auto;padding:72px 82px;background:var(--paper);color:var(--ink);font:17px/1.62 Cambria,Georgia,"Times New Roman",serif;box-shadow:0 5px 24px rgba(24,30,39,.12)}
h1,h2,h3,h4,h5,h6{font-family:Cambria,Georgia,"Times New Roman",serif;font-weight:700;color:#1e3865;line-height:1.2;margin:1.35em 0 .45em;break-after:avoid-page}h1{font-size:2em}h2{font-size:1.55em}h3{font-size:1.25em}p{margin:0 0 .8em;orphans:3;widows:3}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}strong{font-weight:700}blockquote{margin:1.2em 0;padding:.15em 1.2em;border-left:4px solid var(--accent);color:#4b5563;background:#f6f8fc;break-inside:avoid-page}blockquote p{margin:.65em 0}code{font:90%/1.4 "Cascadia Mono",Consolas,monospace;background:var(--code);padding:.12em .3em;border-radius:3px}pre{overflow:auto;padding:1em 1.15em;background:var(--code);border:1px solid var(--line);border-radius:5px;break-inside:avoid-page}pre code{padding:0;background:none}ul,ol{padding-left:1.5em;margin:.5em 0 1em}li{margin:.25em 0;break-inside:avoid-page}hr{border:0;border-top:1px solid var(--line);margin:1.8em 0}figure{margin:1.35em auto;text-align:center;break-inside:avoid-page}img{display:block;max-width:100%;height:auto;margin:auto}figcaption{margin-top:.55em;color:var(--muted);font:13px/1.4 Arial,"Segoe UI",sans-serif}.image-alt{color:var(--muted);font-style:italic}
.heading-space{display:inline-block;width:.3em}
.pdf-code-line{min-height:1.42em;margin:0;padding:0 1em;color:#242a32;background:#f3f5f7;border-left:1px solid #d6dae0;border-right:1px solid #d6dae0;font:9pt/1.42 Consolas,"Liberation Mono",monospace;break-inside:avoid-page}
.pdf-code-line.is-first{padding-top:.75em;border-top:1px solid #d6dae0}.pdf-code-line.is-last{padding-bottom:.75em;margin-bottom:1em;border-bottom:1px solid #d6dae0}.pdf-code-space{display:inline-block;height:1px}.pdf-code-blank{color:#f3f5f7}
.pdf-quote{margin:1em 0;padding:.55em 1em;color:#4b5563;background:#f6f8fc;border-left:4px solid #315fc7;orphans:3;widows:3}
@media print{html{background:#fff}body{max-width:none;margin:0;padding:0;box-shadow:none;font-size:11pt}h1{font-size:16pt}h2{font-size:13pt}h3{font-size:12pt}}
"#;

fn full_html(
    document: &ExportDocument,
    css_href: Option<&str>,
    pdf_code_columns: Option<usize>,
) -> String {
    let styles = css_href
        .map(|href| format!("<link rel=\"stylesheet\" href=\"{href}\">"))
        .unwrap_or_else(|| format!("<style>{DOCUMENT_CSS}</style>"));
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{}</title>{styles}</head><body><main>{}</main></body></html>",
        escape_html(&document.title),
        html_body(document, pdf_code_columns)
    )
}

fn export_html(document: &ExportDocument) -> Result<Vec<u8>, ExportError> {
    let cursor = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("index.html", options)
        .map_err(|e| ExportError::Package(e.to_string()))?;
    zip.write_all(full_html(document, Some("assets/styles.css"), None).as_bytes())?;
    zip.start_file("assets/styles.css", options)
        .map_err(|e| ExportError::Package(e.to_string()))?;
    zip.write_all(DOCUMENT_CSS.as_bytes())?;
    for asset in document.images.values() {
        zip.start_file(&asset.key, options)
            .map_err(|e| ExportError::Package(e.to_string()))?;
        zip.write_all(&asset.bytes)?;
    }
    zip.finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|e| ExportError::Package(e.to_string()))
}

fn export_pdf(document: &ExportDocument, paper: PaperSize) -> Result<Vec<u8>, ExportError> {
    let mut images = BTreeMap::new();
    for asset in document.images.values() {
        images.insert(asset.key.clone(), Base64OrRaw::Raw(asset.bytes.clone()));
    }
    let (width, height) = paper.millimeters();
    let options = GeneratePdfOptions {
        page_width: Some(width),
        page_height: Some(height),
        margin_top: Some(20.0),
        margin_right: Some(20.0),
        margin_bottom: Some(20.0),
        margin_left: Some(20.0),
        show_page_numbers: Some(true),
        footer_text: Some(document.title.clone()),
        skip_first_page: Some(false),
        ..Default::default()
    };
    let html = full_html(document, None, Some(paper.code_columns()));
    if html.contains("<pre") {
        return Err(ExportError::Pdf(
            "the PDF renderer received an unsplittable preformatted block".into(),
        ));
    }
    let mut warnings = Vec::new();
    let pdf = PdfDocument::from_html(&html, &images, &BTreeMap::new(), &options, &mut warnings)
        .map_err(ExportError::Pdf)?;
    Ok(pdf.save(&PdfSaveOptions::default(), &mut warnings))
}

fn docx_run(text: &str, style: &TextStyle) -> Run {
    let mut run = Run::new().add_text(text).fonts(
        RunFonts::new()
            .ascii(if style.code {
                "Cascadia Mono"
            } else {
                "Calibri"
            })
            .hi_ansi(if style.code {
                "Cascadia Mono"
            } else {
                "Calibri"
            }),
    );
    if style.bold {
        run = run.bold();
    }
    if style.italic {
        run = run.italic();
    }
    if style.code {
        run = run.size(19).color("30343B");
    }
    if style.link.is_some() {
        run = run.color("315FC7").underline("single");
    }
    run
}

fn export_docx(document: &ExportDocument, paper: PaperSize) -> Result<Vec<u8>, ExportError> {
    let body_spacing = LineSpacing::new()
        .after(120)
        .line(264)
        .line_rule(LineSpacingType::Auto);
    let mut docx = Docx::new()
        .page_size(paper.twips().0, paper.twips().1)
        .page_margin(
            PageMargin::new()
                .top(1134)
                .right(1134)
                .bottom(1134)
                .left(1134)
                .header(709)
                .footer(709),
        )
        .add_style(
            Style::new("Normal", StyleType::Paragraph)
                .name("Normal")
                .fonts(RunFonts::new().ascii("Calibri").hi_ansi("Calibri"))
                .size(22)
                .color("20252B")
                .line_spacing(body_spacing.clone()),
        )
        .add_style(
            Style::new("MEDHeading1", StyleType::Paragraph)
                .name("Heading 1")
                .fonts(RunFonts::new().ascii("Calibri").hi_ansi("Calibri"))
                .size(32)
                .bold()
                .color("2E5A9E")
                .line_spacing(LineSpacing::new().before(320).after(160).line(240)),
        )
        .add_style(
            Style::new("MEDHeading2", StyleType::Paragraph)
                .name("Heading 2")
                .fonts(RunFonts::new().ascii("Calibri").hi_ansi("Calibri"))
                .size(26)
                .bold()
                .color("2E5A9E")
                .line_spacing(LineSpacing::new().before(240).after(120).line(240)),
        )
        .add_style(
            Style::new("MEDHeading3", StyleType::Paragraph)
                .name("Heading 3")
                .fonts(RunFonts::new().ascii("Calibri").hi_ansi("Calibri"))
                .size(24)
                .bold()
                .color("1F4D78")
                .line_spacing(LineSpacing::new().before(160).after(80).line(240)),
        )
        .add_abstract_numbering(
            AbstractNumbering::new(1).add_level(
                Level::new(
                    0,
                    Start::new(1),
                    NumberFormat::new("bullet"),
                    LevelText::new("•"),
                    LevelJc::new("left"),
                )
                .indent(
                    Some(720),
                    Some(SpecialIndentType::Hanging(360)),
                    None,
                    None,
                ),
            ),
        )
        .add_numbering(Numbering::new(1, 1))
        .add_abstract_numbering(
            AbstractNumbering::new(2).add_level(
                Level::new(
                    0,
                    Start::new(1),
                    NumberFormat::new("decimal"),
                    LevelText::new("%1."),
                    LevelJc::new("left"),
                )
                .indent(
                    Some(720),
                    Some(SpecialIndentType::Hanging(360)),
                    None,
                    None,
                ),
            ),
        )
        .add_numbering(Numbering::new(2, 2));

    let content_width_twips = paper.twips().0.saturating_sub(2268);
    let max_width_emu = content_width_twips * 635;
    for block in &document.blocks {
        if matches!(block.kind, BlockKind::Rule) {
            docx = docx.add_paragraph(
                Paragraph::new().add_run(
                    Run::new()
                        .add_text("────────────────────────")
                        .color("D6DAE0"),
                ),
            );
            continue;
        }
        let mut paragraph = Paragraph::new()
            .widow_control(true)
            .line_spacing(body_spacing.clone());
        match block.kind {
            BlockKind::Heading(level) => {
                paragraph = paragraph
                    .style(match level {
                        1 => "MEDHeading1",
                        2 => "MEDHeading2",
                        _ => "MEDHeading3",
                    })
                    .keep_next(true);
            }
            BlockKind::Quote => {
                paragraph = paragraph.indent(Some(480), None, Some(240), None).italic();
            }
            BlockKind::Code => {
                paragraph = paragraph
                    .keep_lines(true)
                    .indent(Some(240), None, Some(240), None);
            }
            BlockKind::ListItem { ordered, level } => {
                paragraph = paragraph.numbering(
                    NumberingId::new(if ordered { 2 } else { 1 }),
                    IndentLevel::new(level.min(8)),
                );
            }
            _ => {}
        }
        for inline in &block.inlines {
            match inline {
                Inline::Text(text, style) => {
                    let run = docx_run(text, style);
                    paragraph = if let Some(link) = &style.link {
                        paragraph.add_hyperlink(
                            Hyperlink::new(link, HyperlinkType::External).add_run(run),
                        )
                    } else {
                        paragraph.add_run(run)
                    };
                }
                Inline::Break => {
                    paragraph = paragraph.add_run(Run::new().add_break(BreakType::TextWrapping))
                }
                Inline::Image { source, alt } => {
                    if let Some(asset) = document.images.get(source) {
                        let aspect = asset.height as f64 / asset.width.max(1) as f64;
                        let width = max_width_emu.min(asset.width.saturating_mul(9525));
                        let height = (width as f64 * aspect) as u32;
                        paragraph = paragraph.keep_lines(true).add_run(
                            Run::new().add_image(Pic::new(&asset.bytes).size(width, height)),
                        );
                        if !alt.is_empty() {
                            paragraph = paragraph.add_run(
                                Run::new()
                                    .add_break(BreakType::TextWrapping)
                                    .add_text(alt)
                                    .italic()
                                    .color("626B78")
                                    .size(18),
                            );
                        }
                    } else if !alt.is_empty() {
                        paragraph =
                            paragraph.add_run(Run::new().add_text(alt).italic().color("626B78"));
                    }
                }
            }
        }
        docx = docx.add_paragraph(paragraph);
    }
    let mut cursor = Cursor::new(Vec::new());
    docx.build()
        .pack(&mut cursor)
        .map_err(|error| ExportError::Docx(error.to_string()))?;
    Ok(cursor.into_inner())
}

fn escape_xml(value: &str) -> String {
    escape_html(value).replace(char::from(39), "&apos;")
}

fn odt_inline(inlines: &[Inline], images: &HashMap<String, ImageAsset>) -> String {
    let mut xml = String::new();
    for inline in inlines {
        match inline {
            Inline::Break => xml.push_str("<text:line-break/>"),
            Inline::Text(text, style) => {
                let style_name = if style.code {
                    "Code"
                } else if style.bold && style.italic {
                    "BoldItalic"
                } else if style.bold {
                    "Bold"
                } else if style.italic {
                    "Italic"
                } else if style.link.is_some() {
                    "Link"
                } else {
                    "Default"
                };
                let span = format!(
                    "<text:span text:style-name=\"{style_name}\">{}</text:span>",
                    escape_xml(text)
                );
                if let Some(link) = &style.link {
                    xml.push_str(&format!(
                        "<text:a xlink:href=\"{}\">{span}</text:a>",
                        escape_xml(link)
                    ));
                } else {
                    xml.push_str(&span);
                }
            }
            Inline::Image { source, alt } => {
                if let Some(asset) = images.get(source) {
                    let width_cm = 16.0f32.min(asset.width as f32 / 96.0 * 2.54);
                    let height_cm = width_cm * asset.height as f32 / asset.width.max(1) as f32;
                    xml.push_str(&format!("<draw:frame draw:name=\"{}\" text:anchor-type=\"as-char\" svg:width=\"{width_cm:.2}cm\" svg:height=\"{height_cm:.2}cm\"><draw:image xlink:href=\"Pictures/{}\" xlink:type=\"simple\" xlink:show=\"embed\" xlink:actuate=\"onLoad\"/><svg:title>{}</svg:title></draw:frame>", escape_xml(&asset.file_name), escape_xml(&asset.file_name), escape_xml(alt)));
                } else if !alt.is_empty() {
                    xml.push_str(&format!(
                        "<text:span text:style-name=\"Italic\">{}</text:span>",
                        escape_xml(alt)
                    ));
                }
            }
        }
    }
    xml
}

fn export_odt(document: &ExportDocument, paper: PaperSize) -> Result<Vec<u8>, ExportError> {
    let mut body = String::new();
    let mut list_open: Option<bool> = None;
    for block in &document.blocks {
        if let BlockKind::ListItem { ordered, .. } = block.kind {
            if list_open != Some(ordered) {
                if list_open.take().is_some() {
                    body.push_str("</text:list>");
                }
                body.push_str(&format!(
                    "<text:list text:style-name=\"{}\">",
                    if ordered { "NumberList" } else { "BulletList" }
                ));
                list_open = Some(ordered);
            }
            body.push_str(&format!(
                "<text:list-item><text:p text:style-name=\"Body\">{}</text:p></text:list-item>",
                odt_inline(&block.inlines, &document.images)
            ));
            continue;
        }
        if list_open.take().is_some() {
            body.push_str("</text:list>");
        }
        let content = odt_inline(&block.inlines, &document.images);
        match block.kind {
            BlockKind::Heading(level) => body.push_str(&format!("<text:h text:outline-level=\"{}\" text:style-name=\"Heading{}\">{content}</text:h>", level.min(3), level.min(3))),
            BlockKind::Quote => body.push_str(&format!("<text:p text:style-name=\"Quote\">{content}</text:p>")),
            BlockKind::Code => body.push_str(&format!("<text:p text:style-name=\"CodeBlock\">{content}</text:p>")),
            BlockKind::Rule => body.push_str("<text:p text:style-name=\"Rule\"/>"),
            _ => body.push_str(&format!("<text:p text:style-name=\"Body\">{content}</text:p>")),
        }
    }
    if list_open.is_some() {
        body.push_str("</text:list>");
    }
    let (w, h) = paper.millimeters();
    let content_xml = format!(
        r##"<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"><office:automatic-styles><text:list-style style:name="BulletList" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/></text:list-style><text:list-style style:name="NumberList" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style></office:automatic-styles><office:body><office:text>{body}</office:text></office:body></office:document-content>"##
    );
    let styles_xml = format!(
        r##"<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3"><office:styles><style:default-style style:family="paragraph"><style:text-properties style:font-name="Liberation Serif" fo:font-size="11pt"/><style:paragraph-properties fo:line-height="120%" fo:margin-bottom="0.21cm"/></style:default-style><style:style style:name="Body" style:family="paragraph"/><style:style style:name="Heading1" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.56cm" fo:margin-bottom="0.28cm" fo:keep-with-next="always"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="16pt" fo:font-weight="bold" fo:color="#2e5a9e"/></style:style><style:style style:name="Heading2" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="13pt" fo:font-weight="bold" fo:color="#2e5a9e"/></style:style><style:style style:name="Heading3" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.28cm" fo:margin-bottom="0.14cm" fo:keep-with-next="always"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="12pt" fo:font-weight="bold" fo:color="#1f4d78"/></style:style><style:style style:name="Quote" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.5cm" fo:border-left="0.08cm solid #315fc7" fo:padding-left="0.35cm" fo:keep-together="always"/><style:text-properties fo:font-style="italic" fo:color="#4b5563"/></style:style><style:style style:name="CodeBlock" style:family="paragraph"><style:paragraph-properties fo:background-color="#f3f5f7" fo:padding="0.3cm" fo:keep-together="always"/><style:text-properties style:font-name="Liberation Mono" fo:font-size="9.5pt"/></style:style><style:style style:name="Rule" style:family="paragraph"><style:paragraph-properties fo:border-bottom="0.02cm solid #d6dae0" fo:margin-bottom="0.4cm"/></style:style><style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style><style:style style:name="Italic" style:family="text"><style:text-properties fo:font-style="italic"/></style:style><style:style style:name="BoldItalic" style:family="text"><style:text-properties fo:font-weight="bold" fo:font-style="italic"/></style:style><style:style style:name="Code" style:family="text"><style:text-properties style:font-name="Liberation Mono" fo:font-size="9.5pt" fo:background-color="#f3f5f7"/></style:style><style:style style:name="Link" style:family="text"><style:text-properties fo:color="#315fc7" style:text-underline-style="solid"/></style:style><style:style style:name="Default" style:family="text"/></office:styles><office:automatic-styles><style:page-layout style:name="MEDPage"><style:page-layout-properties fo:page-width="{w}mm" fo:page-height="{h}mm" style:print-orientation="portrait" fo:margin="20mm"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="MEDPage"/></office:master-styles></office:document-styles>"##
    );
    let manifest_images = document.images.values().map(|asset| format!("<manifest:file-entry manifest:full-path=\"Pictures/{}\" manifest:media-type=\"{}\"/>", escape_xml(&asset.file_name), asset.media_type)).collect::<String>();
    let manifest = format!(
        r##"<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>{manifest_images}</manifest:manifest>"##
    );

    let cursor = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);
    zip.start_file(
        "mimetype",
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored),
    )
    .map_err(|e| ExportError::Package(e.to_string()))?;
    zip.write_all(b"application/vnd.oasis.opendocument.text")?;
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, content) in [
        ("content.xml", content_xml.as_bytes()),
        ("styles.xml", styles_xml.as_bytes()),
        ("META-INF/manifest.xml", manifest.as_bytes()),
    ] {
        zip.start_file(name, options)
            .map_err(|e| ExportError::Package(e.to_string()))?;
        zip.write_all(content)?;
    }
    for asset in document.images.values() {
        zip.start_file(format!("Pictures/{}", asset.file_name), options)
            .map_err(|e| ExportError::Package(e.to_string()))?;
        zip.write_all(&asset.bytes)?;
    }
    zip.finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|e| ExportError::Package(e.to_string()))
}

fn atomic_write(destination: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    let parent = destination
        .parent()
        .filter(|path| path.exists())
        .ok_or(ExportError::MissingDestination)?;
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("export");
    let temp = parent.join(format!(".{name}.med-export.tmp"));
    fs::write(&temp, bytes)?;
    if destination.exists() {
        fs::remove_file(destination)?;
    }
    if let Err(error) = fs::rename(&temp, destination) {
        let _ = fs::remove_file(&temp);
        return Err(ExportError::Write(error));
    }
    Ok(())
}

pub fn export(request: ExportRequest) -> Result<(), String> {
    let blocks = parse_blocks(&request.markdown);
    let images = resolve_images(
        &blocks,
        request.source_path.as_deref(),
        request.include_images,
    )
    .map_err(|e| e.to_string())?;
    let document = ExportDocument {
        title: request.title,
        blocks,
        images,
    };
    let bytes = match request.format {
        ExportFormat::Pdf => export_pdf(&document, request.paper_size),
        ExportFormat::Docx => export_docx(&document, request.paper_size),
        ExportFormat::Odt => export_odt(&document, request.paper_size),
        ExportFormat::Html => export_html(&document),
    }
    .map_err(|e| e.to_string())?;
    atomic_write(Path::new(&request.destination_path), &bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_line_breaks_are_preserved() {
        let blocks = parse_blocks("one\ntwo");
        assert!(matches!(blocks[0].inlines[1], Inline::Break));
    }

    #[test]
    fn html_package_contains_separate_assets() {
        let document = ExportDocument {
            title: "Test".into(),
            blocks: parse_blocks("# Title\n\nBody"),
            images: HashMap::new(),
        };
        let bytes = export_html(&document).unwrap();
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert!(zip.by_name("index.html").is_ok());
        assert!(zip.by_name("assets/styles.css").is_ok());
    }

    #[test]
    fn all_export_formats_have_valid_container_signatures() {
        let mut markdown = "# MED export\n\nA paragraph with **bold**, *italics*, and [a link](https://example.com).\n\n![Generated color sample](qa.png)\n\n- First item\n- Second item\n\n> A short quotation.\n\n```rust\nfn main() {}\n```".to_string();
        if let Ok(source_path) = std::env::var("MED_EXPORT_QA_SOURCE") {
            markdown = fs::read_to_string(source_path).unwrap();
        }
        if std::env::var("MED_EXPORT_QA_DIR").is_ok() {
            markdown.push_str("\n\n## Basic Image Generation\n\n```tsx\n<Template data={{\n  API_KEY_REF,\n  MODEL: 'google/gemini-2.5-flash-image'\n}}>\n\nconst openRouter = new OpenRouter({ apiKey: '{{API_KEY_REF}}' });\nconst result = await openRouter.chat.send({ model: '{{MODEL}}', messages: [{ role: 'user', content: 'Generate a beautiful sunset over mountains with cinematic lighting and reflections on a lake' }], modalities: ['image', 'text'] });\nconst images = result.choices[0].message.images ?? [];\nfor (const [index, image] of images.entries()) {\n  const imageUrl = image.image_url.url;\n  console.log(`Generated image ${index + 1}: ${imageUrl.substring(0, 50)}...`);\n}\n```\n\n### Supported aspect ratios\n\nThe section following a long code sample must start below it without overlap.");
            markdown.push_str("\n\n## Multi-page code sample\n\n```ts\n");
            for line in 1..=55 {
                markdown.push_str(&format!("const generatedValue{line} = await client.responses.create({{ model: selectedModel, input: buildDetailedRequest(sourceDocument, userPreferences, {line}) }});\n"));
            }
            markdown.push_str("```\n\n### Content after multi-page code\n\nThis heading and paragraph must appear after the final code line, never over it.\n");
            for section in 1..=4 {
                markdown.push_str(&format!("\n\n## Section {section}\n\nThis paragraph exercises pagination with enough natural text to wrap across the available line width. It verifies that body content remains readable and that headings stay with the paragraph that follows them.\n\n> A compact callout should stay together on a page whenever space allows.\n\n- A concise item with useful detail\n- Another item that should never overlap surrounding content"));
            }
        }
        let mut png = Cursor::new(Vec::new());
        let sample = image::RgbaImage::from_fn(640, 240, |x, y| {
            image::Rgba([(49 + x / 4) as u8, (95 + y / 3) as u8, 199, 255])
        });
        image::DynamicImage::ImageRgba8(sample)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let mut images = HashMap::new();
        images.insert(
            "qa.png".into(),
            ImageAsset {
                key: "assets/images/image-1.png".into(),
                file_name: "image-1.png".into(),
                bytes: png.into_inner(),
                width: 640,
                height: 240,
                media_type: "image/png",
            },
        );
        let document = ExportDocument {
            title: "MED export".into(),
            blocks: parse_blocks(&markdown),
            images,
        };
        let pdf = export_pdf(&document, PaperSize::A4).unwrap();
        let docx = export_docx(&document, PaperSize::Letter).unwrap();
        let odt = export_odt(&document, PaperSize::A5).unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        assert!(docx.starts_with(b"PK"));
        assert!(odt.starts_with(b"PK"));

        if let Ok(directory) = std::env::var("MED_EXPORT_QA_DIR") {
            let directory = Path::new(&directory);
            fs::create_dir_all(directory).unwrap();
            fs::write(directory.join("med-export.pdf"), pdf).unwrap();
            fs::write(directory.join("med-export.docx"), docx).unwrap();
            fs::write(directory.join("med-export.odt"), odt).unwrap();
            fs::write(
                directory.join("med-export-html.zip"),
                export_html(&document).unwrap(),
            )
            .unwrap();
        }
    }

    #[test]
    fn pdf_code_lines_wrap_without_losing_characters() {
        let source = "const result = ".to_string() + &"x".repeat(210);
        let wrapped = wrap_code_line(&source, 82);
        assert!(wrapped.len() > 2);
        assert!(wrapped.iter().all(|line| line.chars().count() <= 82));
        assert_eq!(wrapped.concat(), source);

        let document = ExportDocument {
            title: "Code".into(),
            blocks: parse_blocks(&format!("```js\n{source}\n```")),
            images: HashMap::new(),
        };
        let html = full_html(&document, None, Some(82));
        assert!(html.contains("pdf-code-line"));
        assert!(!html.contains("<pre>"));
    }

    #[test]
    fn pdf_html_keeps_adjacent_fenced_blocks_independently_splittable() {
        let markdown = r#"### Examples

<ExampleGroup>

```typescript
const first = await client.responses.create({ model, input });
```

```python
second = client.responses.create(model=model, input=input)
```

```json
{"model":"example","input":"content"}
```

</ExampleGroup>

### Content after examples

This content must be laid out after every code line."#;
        let document = ExportDocument {
            title: "Adjacent code examples".into(),
            blocks: parse_blocks(markdown),
            images: HashMap::new(),
        };

        let html = full_html(&document, None, Some(PaperSize::A4.code_columns()));

        assert!(!html.contains("<pre"));
        assert_eq!(html.matches("pdf-code-line is-first").count(), 3);
        assert!(html.contains("This content must be laid out after every code line."));
    }
}
