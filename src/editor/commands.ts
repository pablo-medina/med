import { schema } from "prosemirror-markdown";
import { TextSelection, type Command } from "prosemirror-state";

/**
 * Inserts MED's single-line Markdown break inside ordinary paragraphs.
 * Structural blocks deliberately fall through to ProseMirror's base Enter
 * behavior so lists continue and headings/code blocks exit or split normally.
 */
export const insertMarkdownLineBreak: Command = (state, dispatch) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;

  const { $from, $to } = selection;
  if (!$from.sameParent($to) || $from.parent.type !== schema.nodes.paragraph) {
    return false;
  }

  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    if ($from.node(depth).type === schema.nodes.list_item) return false;
  }

  if (dispatch) {
    dispatch(
      state.tr
        .replaceSelectionWith(schema.nodes.hard_break.create())
        .scrollIntoView(),
    );
  }

  return true;
};
