import { useEffect, useRef } from "react";
import { DOMSerializer } from "prosemirror-model";
import { markdownSchema, parseMarkdown } from "./markdown";

interface MarkdownPreviewProps {
  value: string;
  label: string;
}

export function MarkdownPreview({ value, label }: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewRef.current) return;
    const parsed = parseMarkdown(value);
    const fragment = DOMSerializer.fromSchema(markdownSchema).serializeFragment(
      parsed.content,
    );
    previewRef.current.replaceChildren(fragment);
  }, [value]);

  return (
    <div
      ref={previewRef}
      className="med-document med-document--preview"
      aria-label={label}
    />
  );
}
