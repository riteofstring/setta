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
import type { CodeLanguage } from "utils/codeLanguage";
import { moveFocus } from "utils/focusManager";
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

type GetExtensionsOptions = {
  parentDivId?: string | null;
  language?: CodeLanguage | null;
  completionsFn?: CompletionSource;
  singleLine?: boolean;
  wrapLines?: boolean;
  tabToAutocomplete?: boolean;
  indentWithTab?: boolean;
  keyComboActions?: Record<string, (text: string) => boolean | void>;
  onTab?: (text: string, completionResult: boolean) => void;
  onEscape?: (status: ReturnType<typeof completionStatus>) => void;
  isDisabled?: boolean;
  useJsx?: boolean;
};

export function getExtensions({
  parentDivId,
  language,
  completionsFn,
  singleLine,
  wrapLines,
  tabToAutocomplete,
  indentWithTab,
  onTab,
  onEscape,
  keyComboActions,
  isDisabled,
  useJsx,
}: GetExtensionsOptions) {
  const extensions = [CODEMIRROR_GUTTER_LAYOUT_FIX];
  const shouldWrap = wrapLines ?? !singleLine;
  if (shouldWrap) {
    extensions.push(EditorView.lineWrapping);
  }
  const enableJsx = useJsx === true;

  if (parentDivId) {
    extensions.push(
      tooltips({
        parent: document.getElementById(parentDivId),
      }),
    );
  }

  if (language === "python") {
    extensions.push(python());
  } else if (language === "typescript") {
    extensions.push(javascript({ typescript: true, jsx: enableJsx }));
  } else if (language === "javascript") {
    extensions.push(javascript({ jsx: enableJsx }));
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
          singleLine,
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
  singleLine,
  tabToAutocomplete,
  onTab,
  onEscape,
  keyComboActions,
}) {
  const settings = useSettings.getState();
  const shouldHandleTabNavigation = tabToAutocomplete && !indentWithTab;

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
      preventDefault: true,
      stopPropagation: true,
      run: (view) => {
        indentLess(view);
      },
    });
  } else if (shouldHandleTabNavigation || singleLine) {
    keymapArray.push({
      key: "Shift-Tab",
      preventDefault: true,
      stopPropagation: true,
      run: (view) => {
        return moveFocus({ direction: -1, from: view.contentDOM });
      },
    });
  }

  if (tabToAutocomplete || indentWithTab) {
    keymapArray.push({
      key: "Tab",
      preventDefault: false,
      stopPropagation: true,
      run: (view) => {
        let completionResult = false;
        let movedFocus = false;
        if (tabToAutocomplete && completionStatus(view.state) === "active") {
          completionResult = acceptCompletion(view);
        } else if (indentWithTab) {
          indentMore(view);
        } else if (shouldHandleTabNavigation || singleLine) {
          movedFocus = moveFocus({ direction: 1, from: view.contentDOM });
        }
        if (onTab) {
          onTab(view.state.doc.toString(), completionResult);
        }
        return indentWithTab || completionResult || movedFocus;
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
