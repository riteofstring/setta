import {
  acceptCompletion,
  autocompletion,
  completionStatus,
} from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { EditorState, Prec } from "@codemirror/state";
import { keymap, tooltips } from "@codemirror/view";
import { EditorView } from "@uiw/react-codemirror";

export function getExtensions({
  sectionId,
  language,
  completionsFn,
  keywordStylizer,
  singleLine,
  tabToAutocomplete,
  onEnter,
  onEscape,
  onModEnterDoNothing,
}) {
  const extensions = [
    EditorView.lineWrapping,
    tooltips({
      parent: document.getElementById(`${sectionId}-CustomResizable`),
    }),
  ];

  if (language === "python") {
    extensions.push(python());
  } else if (language === "javascript") {
    extensions.push(javascript());
  } else if (language === "yaml") {
    extensions.push(yaml());
  } else if (language === "json") {
    extensions.push(json());
  }

  // autocomplete
  if (completionsFn) {
    extensions.push(
      autocompletion({
        override: [completionsFn],
        tooltipClass: () => "nowheel",
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
    extensions.push(
      Prec.highest(
        keymap.of([
          {
            key: "Enter",
            run: onEnter,
          },
        ]),
      ),
    );
  }

  if (onEscape) {
    extensions.push(
      Prec.highest(
        keymap.of([
          {
            key: "Escape",
            run: onEscape,
          },
        ]),
      ),
    );
  }

  if (tabToAutocomplete) {
    extensions.push(
      keymap.of([
        {
          key: "Tab",
          preventDefault: false,
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

  if (onModEnterDoNothing) {
    extensions.push(
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              return true; // important to return true
            },
          },
        ]),
      ),
    );
  }

  return extensions;
}
