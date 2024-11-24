import {
  acceptCompletion,
  autocompletion,
  completionStatus,
} from "@codemirror/autocomplete";
import { indentLess, indentMore } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
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
  indentWithTab,
  escapeToBlur,
  onEnter,
  onTab,
  onEscape,
  onModEnterDoNothing,
  isDisabled,
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
  } else if (language === "markdown") {
    extensions.push(markdown());
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

  extensions.push(
    Prec.highest(
      keymap.of([
        {
          key: "Escape",
          run: (view) => {
            const expectingCompletions = completionStatus(view.state);
            if (escapeToBlur && !expectingCompletions) {
              view.contentDOM.blur();
            }
            if (onEscape) {
              onEscape(expectingCompletions);
            }
          },
        },
      ]),
    ),
  );

  if (tabToAutocomplete || indentWithTab) {
    extensions.push(
      keymap.of([
        {
          key: "Tab",
          preventDefault: false, // we want to control when preventDefault (and therefore also stopPropagation) is called
          stopPropagation: true,
          run: (view) => {
            let completionResult = false;
            if (
              tabToAutocomplete &&
              completionStatus(view.state) === "active"
            ) {
              // trigger preventDefault & stopPropagation based on completion
              completionResult = acceptCompletion(view);
            } else if (indentWithTab) {
              indentMore(view);
            }
            if (onTab) {
              onTab(completionResult);
            }
            // if tab controls indent, then we never want to propagate the keystroke, so return true
            // otherwise it depends on the completion result
            return indentWithTab || completionResult;
          },
        },
      ]),
    );
  }

  if (indentWithTab) {
    extensions.push(
      keymap.of([
        {
          key: "Shift-Tab",
          // if tab controls indent, then always prevent default and stop propagation
          preventDefault: true,
          stopPropagation: true,
          run: (view) => {
            indentLess(view);
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

  if (isDisabled) {
    extensions.push(EditorState.readOnly.of(true));
  }

  return extensions;
}
