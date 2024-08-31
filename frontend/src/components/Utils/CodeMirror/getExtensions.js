import {
  acceptCompletion,
  autocompletion,
  completionStatus,
} from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorState, Prec } from "@codemirror/state";
import { keymap, tooltips } from "@codemirror/view";
import { EditorView } from "@uiw/react-codemirror";
import { debouncedGetKeywordPositionsAndEVRefs } from "requests/sections";

export function getExtensions({
  sectionId,
  paramInfoId,
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

  // Get keyword positions as document changes
  extensions.push(
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        debouncedGetKeywordPositionsAndEVRefs({
          sectionId,
          paramInfoId,
          fullText: update.state.doc.toString(),
        });
      }
    }),
  );

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
