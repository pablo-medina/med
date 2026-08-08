import { Fragment, type NodeType } from "prosemirror-model";
import { baseKeymap, chainCommands } from "prosemirror-commands";
import {
  liftListItem,
  splitListItemKeepMarks,
  wrapInList,
} from "prosemirror-schema-list";
import { Selection, TextSelection, type Command } from "prosemirror-state";
import { markdownSchema } from "./markdown";

export type InsertableBlockKind =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "code"
  | "blockquote"
  | "horizontalRule";

/** Inserts a visual line break without splitting the surrounding list item. */
export const insertMarkdownHardBreak: Command = (state, dispatch) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;

  const { $from, $to } = selection;
  if (
    !$from.sameParent($to)
    || !$from.parent.isTextblock
    || $from.parent.type === markdownSchema.nodes.code_block
  ) {
    return false;
  }

  if (dispatch) {
    dispatch(
      state.tr
        .replaceSelectionWith(markdownSchema.nodes.hard_break.create())
        .scrollIntoView(),
    );
  }
  return true;
};

/** Continues the surrounding list while preserving active inline formatting. */
export const continueList = splitListItemKeepMarks(markdownSchema.nodes.list_item);

const keepCanonicalEmptyParagraph: Command = (state) => {
  const { $from, $to } = state.selection;
  return $from.sameParent($to)
    && $from.depth === 1
    && $from.parent.type === markdownSchema.nodes.paragraph
    && $from.parent.content.size === 0;
};

/** Word-like Enter: continue lists first, otherwise use ProseMirror's block split. */
export const insertParagraphOrContinueList = chainCommands(
  continueList,
  keepCanonicalEmptyParagraph,
  baseKeymap.Enter,
);

function parentListDepth(state: Parameters<Command>[0]) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const type = $from.node(depth).type;
    if (
      type === markdownSchema.nodes.bullet_list
      || type === markdownSchema.nodes.ordered_list
    ) {
      return depth;
    }
  }
  return null;
}

/** Toggles a list and converts the current list when the other list style is selected. */
export function toggleList(listType: NodeType): Command {
  return (state, dispatch) => {
    const depth = parentListDepth(state);
    if (depth !== null) {
      const currentList = state.selection.$from.node(depth);
      if (currentList.type === listType) {
        return liftListItem(markdownSchema.nodes.list_item)(state, dispatch);
      }
      if (dispatch) {
        const attrs = listType === markdownSchema.nodes.ordered_list
          ? { order: 1, tight: true }
          : { tight: true };
        dispatch(
          state.tr
            .setNodeMarkup(state.selection.$from.before(depth), listType, attrs)
            .scrollIntoView(),
        );
      }
      return true;
    }
    const attrs = listType === markdownSchema.nodes.ordered_list
      ? { order: 1, tight: true }
      : { tight: true };
    return wrapInList(listType, attrs)(state, dispatch);
  };
}

function blockNodes(kind: InsertableBlockKind) {
  switch (kind) {
    case "paragraph":
      return [markdownSchema.nodes.paragraph.create()];
    case "heading1":
    case "heading2":
    case "heading3":
      return [markdownSchema.nodes.heading.create({ level: Number(kind.slice(-1)) })];
    case "code":
      return [markdownSchema.nodes.code_block.create()];
    case "blockquote":
      return [markdownSchema.nodes.blockquote.create(
        null,
        markdownSchema.nodes.paragraph.create(),
      )];
    case "horizontalRule":
      return [
        markdownSchema.nodes.horizontal_rule.create(),
        markdownSchema.nodes.paragraph.create(),
      ];
  }
}

/** Inserts a new structural block after the block containing the selection. */
export function insertBlock(kind: InsertableBlockKind): Command {
  return (state, dispatch) => {
    const { $to } = state.selection;
    const nodes = blockNodes(kind);
    const content = Fragment.fromArray(nodes);

    if (
      state.selection.empty
      && $to.parent.type === markdownSchema.nodes.paragraph
      && $to.parent.content.size === 0
    ) {
      const depth = $to.depth;
      const parentDepth = depth - 1;
      const parent = $to.node(parentDepth);
      const index = $to.index(parentDepth);
      if (parent.canReplace(index, index + 1, content)) {
        if (dispatch) {
          const insertAt = $to.before(depth);
          const transaction = state.tr.replaceWith($to.before(depth), $to.after(depth), content);
          const selectionOffset = kind === "horizontalRule"
            ? nodes[0].nodeSize + 1
            : 1;
          transaction.setSelection(
            Selection.near(transaction.doc.resolve(insertAt + selectionOffset), 1),
          );
          dispatch(transaction.scrollIntoView());
        }
        return true;
      }
    }

    for (let depth = $to.depth; depth > 0; depth -= 1) {
      const parentDepth = depth - 1;
      const parent = $to.node(parentDepth);
      const index = $to.indexAfter(parentDepth);
      if (!parent.canReplace(index, index, content)) continue;

      if (dispatch) {
        const insertAt = $to.after(depth);
        const transaction = state.tr.insert(insertAt, content);
        const selectionOffset = kind === "horizontalRule"
          ? nodes[0].nodeSize + 1
          : 1;
        transaction.setSelection(
          Selection.near(transaction.doc.resolve(insertAt + selectionOffset), 1),
        );
        dispatch(transaction.scrollIntoView());
      }
      return true;
    }
    return false;
  };
}
