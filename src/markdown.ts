import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(source: string): string {
  const sanitized = DOMPurify.sanitize(String(marked.parse(source, { async: false })));
  const document = new DOMParser().parseFromString(sanitized, "text/html");
  const occurrences = new Map<string, number>();
  document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
    const base = slug(heading.textContent || "section") || "section";
    const occurrence = occurrences.get(base) || 0;
    occurrences.set(base, occurrence + 1);
    heading.id = occurrence === 0 ? base : `${base}-${occurrence}`;
  });
  return document.body.innerHTML;
}

export interface Heading { level: number; text: string; line: number; id: string }

export function extractHeadings(source: string): Heading[] {
  return source.split("\n").flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!match) return [];
    const text = match[2].replace(/[*_`[\]]/g, "");
    return [{ level: match[1].length, text, line: index + 1, id: slug(text) }];
  });
}

export const slug = (value: string) => value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
