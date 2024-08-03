import {
  acceptCompletion,
  autocompletion,
  completionStatus,
} from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { EditorView } from "@uiw/react-codemirror";

export function getExtensions({
  language,
  completionsFn,
  keywordStylizer,
  singleLine,
  tabToAutocomplete,
  onEnter,
}) {
  const extensions = [EditorView.lineWrapping];

  if (language === "python") {
    extensions.push(python());
  } else if (language === "javascript") {
    extensions.push(javascript());
  }

  // autocomplete
  if (completionsFn) {
    extensions.push(
      autocompletion({
        override: [completionsFn],
      }),
    );
  }

  if (keywordStylizer) {
    extensions.push(keywordStylizer);
  }

  if (singleLine) {
    extensions.push(
      EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr)),
    );
  }

  if (onEnter) {
    const keyBinding = Prec.highest(
      keymap.of([
        {
          key: "Enter",
          run: onEnter,
        },
      ]),
    );
    extensions.push(keyBinding);
  }

  if (tabToAutocomplete) {
    extensions.push(
      keymap.of([
        {
          key: "Tab",
          preventDefault: true,
          // shift: indentLess,
          run: (e) => {
            if (completionStatus(e.state)) {
              return acceptCompletion(e);
            }
          },
        },
      ]),
    );
  }

  return extensions;
}
