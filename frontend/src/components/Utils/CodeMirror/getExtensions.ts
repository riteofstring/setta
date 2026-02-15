import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionKeymap,
  CompletionSource,
  completionStatus,
  pickedCompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import { indentLess, indentMore } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
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
const TOML_LANGUAGE = StreamLanguage.define(tomlMode);

type GetExtensionsOptions = {
  parent?: HTMLElement | null;
  language?: CodeLanguage | null;
  completionsFn?: CompletionSource;
  completionInteractionDelayMs?: number;
  singleLine?: boolean;
  wrapLines?: boolean;
  tabToAutocomplete?: boolean;
  indentWithTab?: boolean;
  keyComboActions?: Record<string, (text: string) => boolean | void>;
  onTab?: (text: string, completionResult: boolean) => void;
  onEnter?: (text: string, completionResult: boolean) => void;
  onEscape?: (status: ReturnType<typeof completionStatus>) => void;
  isDisabled?: boolean;
  useJsx?: boolean;
  triggerCompletionAfterAccept?: boolean;
  completionTriggerChars?: string[];
};

export function getExtensions({
  parent,
  language,
  completionsFn,
  completionInteractionDelayMs,
  singleLine,
  wrapLines,
  tabToAutocomplete,
  indentWithTab,
  onTab,
  onEnter,
  onEscape,
  keyComboActions,
  isDisabled,
  useJsx,
  triggerCompletionAfterAccept,
  completionTriggerChars,
}: GetExtensionsOptions) {
  const extensions = [CODEMIRROR_GUTTER_LAYOUT_FIX];
  const shouldWrap = wrapLines ?? !singleLine;
  const triggerChars = completionTriggerChars ?? ["/", "\\"];
  if (shouldWrap) {
    extensions.push(EditorView.lineWrapping);
  }
  const enableJsx = useJsx === true;

  if (parent) {
    extensions.push(
      tooltips({
        parent,
      }),
    );
  }

  extensions.push(...getLanguageExtensions(language, enableJsx));

  // autocomplete
  if (completionsFn) {
    extensions.push(
      autocompletion({
        override: [completionsFn],
        tooltipClass: () => "nowheel",
        interactionDelay: completionInteractionDelayMs,
        selectOnOpen: true,
        activateOnTyping: true,
      }),
    );
    if (completionTriggerChars && completionTriggerChars.length > 0) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }
          const isUserInput = update.transactions.some((tr) =>
            tr.isUserEvent("input"),
          );
          if (!isUserInput) {
            return;
          }
          let insertedTextHasTriggerChar = false;
          update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
            if (insertedTextHasTriggerChar) {
              return;
            }
            const insertedText = inserted.toString();
            if (!insertedText) {
              return;
            }
            insertedTextHasTriggerChar = triggerChars.some((char) =>
              insertedText.includes(char),
            );
          });
          if (!insertedTextHasTriggerChar) {
            return;
          }
          if (!update.view.hasFocus) {
            return;
          }
          if (completionStatus(update.state) === "active") {
            return;
          }
          queueMicrotask(() => startCompletion(update.view));
        }),
      );
    }
    if (triggerCompletionAfterAccept) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }
          for (const transaction of update.transactions) {
            if (transaction.annotation(pickedCompletion)) {
              const lastChar = update.state.doc.sliceString(
                update.state.doc.length - 1,
              );
              if (triggerChars.includes(lastChar)) {
                if (!update.view.hasFocus) {
                  return;
                }
                // Defer to the next tick so CodeMirror's own completion accept
                // transaction has fully settled before we re-trigger completion.
                queueMicrotask(() => {
                  if (!update.view.hasFocus) {
                    return;
                  }
                  if (completionStatus(update.view.state) === "active") {
                    return;
                  }
                  startCompletion(update.view);
                });
              }
              break;
            }
          }
        }),
      );
    }
  }

  if (singleLine) {
    extensions.push(
      EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr)),
    );
  }

  if (isDisabled) {
    extensions.push(EditorState.readOnly.of(true));
  }

  const keymapArray = getKeyMapArray({
    hasCompletions: Boolean(completionsFn),
    indentWithTab,
    singleLine,
    tabToAutocomplete,
    onTab,
    onEnter,
    onEscape,
    keyComboActions,
  });
  const fullKeymap =
    completionsFn && completionsFn !== null
      ? [...keymapArray, ...completionKeymap]
      : keymapArray;
  extensions.push(Prec.highest(keymap.of(fullKeymap)));

  return extensions;
}

export function getLanguageExtensions(
  language: CodeLanguage | null | undefined,
  useJsx: boolean,
) {
  if (language === "python") {
    return [python()];
  }
  if (language === "typescript") {
    return [javascript({ typescript: true, jsx: useJsx })];
  }
  if (language === "javascript") {
    return [javascript({ jsx: useJsx })];
  }
  if (language === "json") {
    return [json()];
  }
  if (language === "yaml") {
    return [yaml()];
  }
  if (language === "toml") {
    return [TOML_LANGUAGE];
  }
  if (language === "markdown") {
    return [markdown()];
  }
  return [];
}

function getKeyMapArray({
  hasCompletions,
  indentWithTab,
  singleLine,
  tabToAutocomplete,
  onTab,
  onEnter,
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

  if (onEnter) {
    keymapArray.push({
      key: "Enter",
      preventDefault: true,
      stopPropagation: true,
      run: (view) => {
        // In single-line "submit" inputs (like the Browser path bar) Enter should
        // submit, not silently accept a completion. If a caller wants Enter to
        // accept completions, they should disable tab-to-autocomplete so Enter
        // is the primary completion interaction.
        const completionResult =
          hasCompletions && !tabToAutocomplete ? acceptCompletion(view) : false;
        if (hasCompletions) {
          closeCompletion(view);
        }
        onEnter(view.state.doc.toString(), completionResult);
        return true;
      },
    });
  }

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
        if (tabToAutocomplete && hasCompletions) {
          completionResult = acceptCompletion(view);
        }
        if (!completionResult) {
          if (indentWithTab) {
            indentMore(view);
          } else if (shouldHandleTabNavigation || singleLine) {
            movedFocus = moveFocus({ direction: 1, from: view.contentDOM });
          }
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
