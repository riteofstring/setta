import {
  acceptCompletion,
  autocompletion,
  completionStatus,
} from "@codemirror/autocomplete";
import { indentLess, indentMore } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { EditorState, Prec, StateField } from "@codemirror/state";
import { keymap, showTooltip, tooltips } from "@codemirror/view";
import { EditorView } from "@uiw/react-codemirror";

export function getExtensions({
  sectionId,
  language,
  completionsFn,
  keywordStylizer,
  singleLine,
  tabToAutocomplete,
  indentWithTab,
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

  if (tabToAutocomplete || indentWithTab) {
    extensions.push(
      keymap.of([
        {
          key: "Tab",
          preventDefault: false, // we want to control when preventDefault (and therefore also stopPropagation) is called
          stopPropagation: true,
          run: (e) => {
            let completionResult = false;
            if (tabToAutocomplete && completionStatus(e.state)) {
              // trigger preventDefault & stopPropagation based on completion
              completionResult = acceptCompletion(e);
            } else if (indentWithTab) {
              indentMore(e);
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

  extensions.push(cursorTooltipField, cursorTooltipBaseTheme);

  return extensions;
}

function cursorTooltipExtension({ sectionId, paramInfoId }) {
  function getCursorTooltips(state) {
    return state.selection.ranges
      .filter((range) => range.empty)
      .map((range) => {
        let line = state.doc.lineAt(range.head);
        let text = line.number + ":" + (range.head - line.from);
        return {
          pos: range.head,
          above: true,
          strictSide: true,
          arrow: true,
          create: () => {
            let dom = document.createElement("div");
            dom.className = "cm-tooltip-cursor";
            dom.textContent = text;
            return { dom };
          },
        };
      });
  }

  const cursorTooltipField = StateField.define({
    create: getCursorTooltips,

    update(tooltips, tr) {
      if (!tr.docChanged && !tr.selection) return tooltips;
      return getCursorTooltips(tr.state);
    },

    provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
  });

  const cursorTooltipBaseTheme = EditorView.baseTheme({
    ".cm-tooltip.cm-tooltip-cursor": {
      backgroundColor: "#66b",
      color: "white",
      border: "none",
      padding: "2px 7px",
      borderRadius: "4px",
      "& .cm-tooltip-arrow:before": {
        borderTopColor: "#66b",
      },
      "& .cm-tooltip-arrow:after": {
        borderTopColor: "transparent",
      },
    },
  });
}
