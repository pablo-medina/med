import { describe, expect, it } from "vitest";
import {
  canonicalizeMarkdown,
  markdownSchema,
  parseMarkdown,
  serializeMarkdown,
} from "./markdown";

describe("canonicalizeMarkdown", () => {
  it("is idempotent", () => {
    const source = [
      "# A document",
      "",
      "* one",
      "* two",
      "",
      "> A quote with **strong text**.",
      "",
      "```ts",
      "const ready = true;",
      "```",
    ].join("\r\n");

    const once = canonicalizeMarkdown(source);
    expect(canonicalizeMarkdown(once)).toBe(once);
  });

  it("uses one stable bullet marker and line ending", () => {
    expect(canonicalizeMarkdown("* one\r\n* two")).toBe("* one\n* two");
  });

  it("keeps an empty document empty", () => {
    expect(canonicalizeMarkdown("")).toBe("");
  });

  it("preserves single line breaks without adding blank lines", () => {
    const source = "first line\nsecond line\nthird line";

    expect(canonicalizeMarkdown(source)).toBe(source);
    expect(canonicalizeMarkdown(canonicalizeMarkdown(source))).toBe(source);
  });

  it("keeps blank lines as paragraph separators", () => {
    expect(canonicalizeMarkdown("first paragraph\n\nsecond paragraph")).toBe(
      "first paragraph\n\nsecond paragraph",
    );
  });

  it("serializes visual line breaks as one source newline", () => {
    const document = markdownSchema.node("doc", null, [
      markdownSchema.node("paragraph", null, [
        markdownSchema.text("first line"),
        markdownSchema.node("hard_break"),
        markdownSchema.text("second line"),
      ]),
    ]);

    expect(serializeMarkdown(document)).toBe("first line\nsecond line");
    expect(parseMarkdown("first line\nsecond line").toJSON()).toEqual(
      document.toJSON(),
    );
  });

  it("escapes literal list markers after a visual line break", () => {
    const document = markdownSchema.node("doc", null, [
      markdownSchema.node("paragraph", null, [
        markdownSchema.text("ordinary line"),
        markdownSchema.node("hard_break"),
        markdownSchema.text("- literal bullet"),
        markdownSchema.node("hard_break"),
        markdownSchema.text("1. literal number"),
      ]),
    ]);

    const markdown = serializeMarkdown(document);
    expect(markdown).toBe("ordinary line\n\\- literal bullet\n1\\. literal number");
    expect(parseMarkdown(markdown).toJSON()).toEqual(document.toJSON());
  });

  it("parses and serializes GFM tables with inline formatting and alignment", () => {
    const source = [
      "| Name | Score |",
      "| :--- | ---: |",
      "| **Ada** | `42` |",
    ].join("\n");

    const document = parseMarkdown(source);

    expect(document.firstChild?.type).toBe(markdownSchema.nodes.table);
    expect(document.firstChild?.child(0).child(0).type).toBe(
      markdownSchema.nodes.table_header,
    );
    expect(document.firstChild?.child(0).child(1).attrs.align).toBe("right");
    expect(serializeMarkdown(document)).toBe(source);
  });
});
