import { describe, expect, it } from "vitest";
import { schema } from "prosemirror-markdown";
import { EditorState, TextSelection } from "prosemirror-state";
import { insertMarkdownLineBreak } from "./commands";
import {
  canonicalizeMarkdown,
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
    const document = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("first line"),
        schema.node("hard_break"),
        schema.text("second line"),
      ]),
    ]);

    expect(serializeMarkdown(document)).toBe("first line\nsecond line");
    expect(parseMarkdown("first line\nsecond line").toJSON()).toEqual(
      document.toJSON(),
    );
  });
});

describe("insertMarkdownLineBreak", () => {
  it("inserts one hard break when Enter is pressed in a paragraph", () => {
    const document = parseMarkdown("firstsecond");
    const state = EditorState.create({
      schema,
      doc: document,
      selection: TextSelection.create(document, 6),
    });
    let nextState = state;

    expect(
      insertMarkdownLineBreak(state, (transaction) => {
        nextState = state.apply(transaction);
      }),
    ).toBe(true);
    expect(serializeMarkdown(nextState.doc)).toBe("first\nsecond");
  });

  it("lets the base keymap handle Enter in a list", () => {
    const document = parseMarkdown("* item");
    const state = EditorState.create({
      schema,
      doc: document,
      selection: TextSelection.create(document, 4),
    });

    expect(insertMarkdownLineBreak(state)).toBe(false);
  });

  it("lets the base keymap handle Enter in a heading", () => {
    const document = parseMarkdown("# Heading");
    const state = EditorState.create({
      schema,
      doc: document,
      selection: TextSelection.create(document, 4),
    });

    expect(insertMarkdownLineBreak(state)).toBe(false);
  });
});
