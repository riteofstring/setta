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
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, tooltips } from "@codemirror/view";
import { redoProjectState, undoProjectState } from "state/actions/undo";
import { useSettings } from "state/definitions";
import type { CodeLanguage } from "utils/codeLanguage";
import { moveFocus } from "utils/focusManager";
import { shortcutCodemirrorFormat } from "utils/utils";
import { getCodeMirrorLanguageExtensions } from "./codeMirrorLanguages";

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
const SINGLE_LINE_TRANSACTION_FILTER = EditorState.transactionFilter.of((tr) =>
  tr.newDoc.lines > 1 ? [] : tr,
);
const READ_ONLY_EXTENSION = EditorState.readOnly.of(true);
const EXTENSION_PREFIX_CACHE = new Map<string, Array<Extension>>();
const EXTENSION_SUFFIX_CACHE = new Map<string, Array<Extension>>();
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
  const shouldWrap = wrapLines ?? !singleLine;
  const triggerChars = completionTriggerChars ?? ["/", "\\"];
  const enableJsx = useJsx === true;
  const extensions = [...getExtensionPrefix(shouldWrap)];

  if (parent) {
    extensions.push(
      tooltips({
        parent,
      }),
    );
  }

  extensions.push(
    ...getExtensionSuffix({
      language,
      useJsx: enableJsx,
      singleLine: Boolean(singleLine),
      isDisabled: Boolean(isDisabled),
    }),
  );

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
  return getCodeMirrorLanguageExtensions(language, useJsx);
}

function getExtensionPrefix(shouldWrap: boolean): Array<Extension> {
  const cacheKey = shouldWrap ? "wrap" : "nowrap";
  const cached = EXTENSION_PREFIX_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }
  const extensions: Array<Extension> = [CODEMIRROR_GUTTER_LAYOUT_FIX];
  if (shouldWrap) {
    extensions.push(EditorView.lineWrapping);
  }
  EXTENSION_PREFIX_CACHE.set(cacheKey, extensions);
  return extensions;
}

function getExtensionSuffix({
  language,
  useJsx,
  singleLine,
  isDisabled,
}: {
  language: CodeLanguage | null | undefined;
  useJsx: boolean;
  singleLine: boolean;
  isDisabled: boolean;
}): Array<Extension> {
  const cacheKey = `${language ?? ""}|${useJsx ? 1 : 0}|${singleLine ? 1 : 0}|${isDisabled ? 1 : 0}`;
  const cached = EXTENSION_SUFFIX_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }
  const extensions: Array<Extension> = [
    ...getLanguageExtensions(language, useJsx),
  ];
  if (singleLine) {
    extensions.push(SINGLE_LINE_TRANSACTION_FILTER);
  }
  if (isDisabled) {
    extensions.push(READ_ONLY_EXTENSION);
  }
  EXTENSION_SUFFIX_CACHE.set(cacheKey, extensions);
  return extensions;
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
