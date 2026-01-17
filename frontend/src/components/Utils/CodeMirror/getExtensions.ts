import {
  acceptCompletion,
  autocompletion,
  CompletionSource,
  completionStatus,
} from "@codemirror/autocomplete";
import { indentLess, indentMore } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, tooltips } from "@codemirror/view";
import { redoProjectState, undoProjectState } from "state/actions/undo";
import { useSettings } from "state/definitions";
import { shortcutCodemirrorFormat } from "utils/utils";

const CODEMIRROR_GUTTER_LAYOUT_FIX = EditorView.baseTheme({
  ".cm-gutters": {
    borderRight: "0",
  },
  "&light .cm-gutters": {
    borderRight: "0",
  },
  "&dark .cm-gutters": {
    borderRight: "0",
  },
});

export function getExtensions({
  parentDivId,
  language,
  completionsFn,
  singleLine,
  tabToAutocomplete,
  indentWithTab,
  onTab,
  onEscape,
  keyComboActions,
  isDisabled,
}: {
  completionsFn?: CompletionSource;
}) {
  const extensions = [EditorView.lineWrapping, CODEMIRROR_GUTTER_LAYOUT_FIX];

  if (parentDivId) {
    extensions.push(
      tooltips({
        parent: document.getElementById(parentDivId),
      }),
    );
  }

  if (language === "python") {
    extensions.push(python());
  } else if (language === "javascript") {
    extensions.push(javascript());
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

  if (singleLine) {
    extensions.push(
      EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr)),
    );
  }

  if (isDisabled) {
    extensions.push(EditorState.readOnly.of(true));
  }

  extensions.push(
    Prec.highest(
      keymap.of(
        getKeyMapArray({
          indentWithTab,
          tabToAutocomplete,
          onTab,
          onEscape,
          keyComboActions,
        }),
      ),
    ),
  );

  return extensions;
}

function getKeyMapArray({
  indentWithTab,
  tabToAutocomplete,
  onTab,
  onEscape,
  keyComboActions,
}) {
  const settings = useSettings.getState();

  // we call undo and redo here because in keyActivations,
  // undo/redo are disabled in input fields.
  // But at the same time, we want to override codemirror's undo/redo
  const keymapArray = [
    {
      key: shortcutCodemirrorFormat(settings.shortcuts.undoShortcut),
      run: () => {
        undoProjectState();
        return true;
      },
    },
    {
      key: shortcutCodemirrorFormat(settings.shortcuts.redoShortcut),
      run: () => {
        redoProjectState();
        return true;
      },
    },
    {
      key: shortcutCodemirrorFormat(settings.shortcuts.runCodeShortcut),
      run: () => true,
    },
    {
      key: shortcutCodemirrorFormat(
        settings.shortcuts.runEntryCodeBlockShortcut,
      ),
      run: () => true,
    },
    {
      key: "Escape",
      run: (view) => {
        if (onEscape) {
          const expectingCompletions = completionStatus(view.state);
          onEscape(expectingCompletions);
        }
      },
    },
  ];

  if (indentWithTab) {
    keymapArray.push({
      key: "Shift-Tab",
      preventDefault: false,
      stopPropagation: false,
      run: (view) => {
        indentLess(view);
      },
    });
  }

  if (tabToAutocomplete || indentWithTab) {
    keymapArray.push({
      key: "Tab",
      preventDefault: false,
      stopPropagation: false,
      run: (view) => {
        let completionResult = false;
        if (tabToAutocomplete && completionStatus(view.state) === "active") {
          // let the focus manager handle navigation; keep completion behavior
          completionResult = acceptCompletion(view);
        } else if (indentWithTab) {
          indentMore(view);
        }
        if (onTab) {
          onTab(view.state.doc.toString(), completionResult);
        }
        // keep CodeMirror state updates while allowing tab navigation to bubble
        return indentWithTab || completionResult;
      },
    });
  }

  if (keyComboActions) {
    for (const [combo, action] of Object.entries(keyComboActions)) {
      keymapArray.push({
        key: combo,
        run: (view) => action(view.state.doc.toString()),
      });
    }
  }

  return keymapArray;
}
