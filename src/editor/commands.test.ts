import { describe, expect, it } from "vitest";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import {
  insertBlock,
  insertMarkdownHardBreak,
  insertParagraphOrContinueList,
  toggleList,
} from "./commands";
import { markdownSchema, parseMarkdown, serializeMarkdown } from "./markdown";

function stateWithCursor(markdown: string, textOffset?: number) {
  const doc = parseMarkdown(markdown);
  let textStart = 0;
  let textLength = 0;
  doc.descendants((node, position) => {
    if (!textStart && node.isText) {
      textStart = position;
      textLength = node.nodeSize;
    }
  });
  const offset = textOffset ?? textLength;
  return EditorState.create({
    schema: markdownSchema,
    doc,
    selection: TextSelection.create(doc, textStart ? textStart + offset : 1),
  });
}

function run(command: Command, state: EditorState) {
  let nextState = state;
  const handled = command(state, (transaction) => {
    nextState = state.apply(transaction);
  });
  return { handled, state: nextState };
}

describe("list editing commands", () => {
  it("continues a list with a new item on Enter", () => {
    const result = run(insertParagraphOrContinueList, stateWithCursor("* first"));

    expect(result.handled).toBe(true);
    expect(result.state.doc.firstChild?.type).toBe(markdownSchema.nodes.bullet_list);
    expect(result.state.doc.firstChild?.childCount).toBe(2);
  });

  it("splits an ordinary paragraph on Enter", () => {
    const result = run(
      insertParagraphOrContinueList,
      stateWithCursor("firstsecond", 5),
    );

    expect(result.handled).toBe(true);
    expect(result.state.doc.childCount).toBe(2);
    expect(result.state.doc.child(0).textContent).toBe("first");
    expect(result.state.doc.child(1).textContent).toBe("second");
  });

  it("does not create an unserializable extra paragraph from an empty document", () => {
    const initial = stateWithCursor("");
    const result = run(insertParagraphOrContinueList, initial);

    expect(result.handled).toBe(true);
    expect(result.state.doc.toJSON()).toEqual(initial.doc.toJSON());
    expect(serializeMarkdown(result.state.doc)).toBe("");
  });

  it("uses a hard break for Shift+Enter without splitting the list item", () => {
    const result = run(insertMarkdownHardBreak, stateWithCursor("* firstsecond", 5));
    const list = result.state.doc.firstChild;
    const paragraph = list?.firstChild?.firstChild;

    expect(result.handled).toBe(true);
    expect(list?.childCount).toBe(1);
    expect(paragraph?.child(1).type).toBe(markdownSchema.nodes.hard_break);
  });

  it("toggles a paragraph into and back out of a list", () => {
    const wrapped = run(
      toggleList(markdownSchema.nodes.ordered_list),
      stateWithCursor("first"),
    );
    const unwrapped = run(
      toggleList(markdownSchema.nodes.ordered_list),
      wrapped.state,
    );

    expect(wrapped.state.doc.firstChild?.type).toBe(markdownSchema.nodes.ordered_list);
    expect(serializeMarkdown(wrapped.state.doc)).toBe("1. first");
    expect(parseMarkdown(serializeMarkdown(wrapped.state.doc)).toJSON()).toEqual(
      wrapped.state.doc.toJSON(),
    );
    expect(unwrapped.state.doc.firstChild?.type).toBe(markdownSchema.nodes.paragraph);
  });
});

describe("block insertion", () => {
  it("inserts an editable code block after a block with content", () => {
    const result = run(insertBlock("code"), stateWithCursor("paragraph"));

    expect(result.handled).toBe(true);
    expect(result.state.doc.childCount).toBe(2);
    expect(result.state.doc.child(1).type).toBe(markdownSchema.nodes.code_block);
    expect(result.state.selection.$from.parent.type).toBe(markdownSchema.nodes.code_block);
  });

  it("replaces an empty paragraph with the inserted block", () => {
    const result = run(insertBlock("code"), stateWithCursor(""));

    expect(result.handled).toBe(true);
    expect(result.state.doc.childCount).toBe(1);
    expect(result.state.doc.firstChild?.type).toBe(markdownSchema.nodes.code_block);
    expect(result.state.selection.$from.parent.type).toBe(markdownSchema.nodes.code_block);
  });
});
