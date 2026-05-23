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
import { EditorState, Prec, type ChangeSpec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  tooltips,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import type { DirtyNodeReason } from "gpuFlow/dirtyTracking";
import { dispatchGpuFlowNodeDirtyEvent } from "gpuFlow/nodeDirtyEvents";
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
const GPU_FLOW_DIRTY_UPDATE_LISTENER = EditorView.updateListener.of(
  (update) => {
    const reason = getGpuFlowCodeMirrorDirtyReason(update);
    if (!reason) {
      return;
    }
    dispatchGpuFlowNodeDirtyEvent(update.view.dom, {
      priority: update.view.hasFocus ? "interactive" : "visible",
      reason,
    });
  },
);
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
  onActivity?: () => void;
  onTab?: (text: string, completionResult: boolean) => void;
  onEnter?: (text: string, completionResult: boolean) => void;
  onEscape?: (status: ReturnType<typeof completionStatus>) => void;
  isDisabled?: boolean;
  useJsx?: boolean;
  triggerCompletionAfterAccept?: boolean;
  completionTriggerChars?: string[];
};

type GetKeyMapArrayOptions = {
  hasCompletions: boolean;
  indentWithTab?: boolean;
  singleLine?: boolean;
  tabToAutocomplete?: boolean;
  keyComboActions?: Record<string, (text: string) => boolean | void>;
  onTab?: (text: string, completionResult: boolean) => void;
  onEnter?: (text: string, completionResult: boolean) => void;
  onEscape?: (status: ReturnType<typeof completionStatus>) => void;
};

type ShortcutSettings = ReturnType<typeof useSettings.getState>["shortcuts"];

type TabBehavior = {
  hasCompletions: boolean;
  indentWithTab: boolean;
  shouldHandleTabNavigation: boolean;
  singleLine: boolean;
  tabToAutocomplete: boolean;
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
  onActivity,
  keyComboActions,
  isDisabled,
  useJsx,
  triggerCompletionAfterAccept,
  completionTriggerChars,
}: GetExtensionsOptions) {
  const extensions = [
    CODEMIRROR_GUTTER_LAYOUT_FIX,
    GPU_FLOW_DIRTY_UPDATE_LISTENER,
  ];
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
  extensions.push(
    ...getAutocompleteExtensions({
      completionsFn,
      completionInteractionDelayMs,
      completionTriggerChars,
      triggerCompletionAfterAccept,
      triggerChars,
    }),
  );

  if (singleLine) {
    extensions.push(createSingleLineTransactionFilter());
  }

  if (isDisabled) {
    extensions.push(EditorState.readOnly.of(true));
  }

  if (onActivity) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          onActivity();
        }
      }),
    );
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

function createSingleLineTransactionFilter() {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) {
      return tr;
    }
    const changes: ChangeSpec[] = [];
    let normalized = false;
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const insertedText = inserted.toString();
      const normalizedInsertedText =
        normalizeCodeMirrorSingleLineText(insertedText);
      if (normalizedInsertedText !== insertedText) {
        normalized = true;
      }
      changes.push({
        from: fromA,
        insert: normalizedInsertedText,
        to: toA,
      });
    });
    if (!normalized) {
      return tr.newDoc.lines > 1 ? [] : tr;
    }
    const normalizedTransaction = tr.startState.update({ changes });
    return normalizedTransaction.newDoc.lines > 1 ? [] : { changes };
  });
}

function normalizeCodeMirrorSingleLineText(text: string): string {
  return text.replace(/\r\n?|\n/g, " ");
}

export function getGpuFlowCodeMirrorDirtyReason(
  update: Pick<
    ViewUpdate,
    | "docChanged"
    | "focusChanged"
    | "geometryChanged"
    | "selectionSet"
    | "viewportChanged"
  >,
): DirtyNodeReason | null {
  if (update.docChanged) {
    return "input";
  }
  if (update.selectionSet) {
    return "selection";
  }
  if (update.viewportChanged || update.geometryChanged) {
    return "scroll";
  }
  if (update.focusChanged) {
    return "focus";
  }
  return null;
}

function getLanguageExtensions(
  language: CodeLanguage | null | undefined,
  useJsx: boolean,
) {
  return getCodeMirrorLanguageExtensions(language, useJsx);
}

function getAutocompleteExtensions({
  completionsFn,
  completionInteractionDelayMs,
  completionTriggerChars,
  triggerCompletionAfterAccept,
  triggerChars,
}: Pick<
  GetExtensionsOptions,
  | "completionsFn"
  | "completionInteractionDelayMs"
  | "completionTriggerChars"
  | "triggerCompletionAfterAccept"
> & {
  triggerChars: string[];
}) {
  if (!completionsFn) {
    return [];
  }

  const extensions = [
    autocompletion({
      override: [completionsFn],
      tooltipClass: () => "nowheel",
      interactionDelay: completionInteractionDelayMs,
      selectOnOpen: true,
      activateOnTyping: true,
    }),
  ];

  if (completionTriggerChars && completionTriggerChars.length > 0) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (!shouldTriggerCompletionOnTyping(update, triggerChars)) {
          return;
        }
        queueMicrotask(() => startCompletion(update.view));
      }),
    );
  }

  if (triggerCompletionAfterAccept) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (!shouldTriggerCompletionAfterAccept(update, triggerChars)) {
          return;
        }
        // Defer to the next tick so CodeMirror's own completion accept
        // transaction has fully settled before we re-trigger completion.
        queueMicrotask(() => {
          if (!shouldStartCompletion(update.view)) {
            return;
          }
          startCompletion(update.view);
        });
      }),
    );
  }

  return extensions;
}

function shouldTriggerCompletionOnTyping(
  update: ViewUpdate,
  triggerChars: string[],
) {
  if (!update.docChanged) {
    return false;
  }
  const isUserInput = update.transactions.some((tr) => tr.isUserEvent("input"));
  if (!isUserInput) {
    return false;
  }
  if (!containsInsertedTriggerChar(update, triggerChars)) {
    return false;
  }
  return shouldStartCompletion(update.view);
}

function containsInsertedTriggerChar(
  update: ViewUpdate,
  triggerChars: string[],
) {
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
  return insertedTextHasTriggerChar;
}

function shouldTriggerCompletionAfterAccept(
  update: ViewUpdate,
  triggerChars: string[],
) {
  if (!update.docChanged) {
    return false;
  }
  for (const transaction of update.transactions) {
    if (!transaction.annotation(pickedCompletion)) {
      continue;
    }
    const lastChar = update.state.doc.sliceString(update.state.doc.length - 1);
    return (
      triggerChars.includes(lastChar) && shouldStartCompletion(update.view)
    );
  }
  return false;
}

function shouldStartCompletion(view: EditorView) {
  if (!view.hasFocus) {
    return false;
  }
  return completionStatus(view.state) !== "active";
}

function resolveTabBehavior({
  hasCompletions,
  indentWithTab,
  singleLine,
  tabToAutocomplete,
}: GetKeyMapArrayOptions): TabBehavior {
  const shouldIndentWithTab = indentWithTab === true;
  const shouldAutocompleteOnTab = tabToAutocomplete === true;
  const isSingleLine = singleLine === true;
  return {
    hasCompletions,
    indentWithTab: shouldIndentWithTab,
    shouldHandleTabNavigation: shouldAutocompleteOnTab && !shouldIndentWithTab,
    singleLine: isSingleLine,
    tabToAutocomplete: shouldAutocompleteOnTab,
  };
}

function getBaseKeyBindings(
  shortcuts: ShortcutSettings,
  onEscape: GetKeyMapArrayOptions["onEscape"],
): Array<KeyBinding> {
  return [
    {
      key: shortcutCodemirrorFormat(shortcuts.undoShortcut),
      run: () => {
        undoProjectState();
        return true;
      },
    },
    {
      key: shortcutCodemirrorFormat(shortcuts.redoShortcut),
      run: () => {
        redoProjectState();
        return true;
      },
    },
    {
      key: shortcutCodemirrorFormat(shortcuts.runCodeShortcut),
      run: () => true,
    },
    {
      key: shortcutCodemirrorFormat(shortcuts.runEntryCodeBlockShortcut),
      run: () => true,
    },
    {
      key: "Escape",
      run: (view) => {
        if (!onEscape) {
          return false;
        }
        onEscape(completionStatus(view.state));
        return false;
      },
    },
  ];
}

function getEnterKeyBinding({
  hasCompletions,
  onEnter,
  tabToAutocomplete,
}: Pick<
  GetKeyMapArrayOptions,
  "hasCompletions" | "onEnter" | "tabToAutocomplete"
>): Array<KeyBinding> {
  if (!onEnter) {
    return [];
  }

  return [
    {
      key: "Enter",
      preventDefault: true,
      stopPropagation: true,
      run: (view) => {
        const completionResult = maybeAcceptEnterCompletion(
          view,
          hasCompletions,
          tabToAutocomplete === true,
        );
        if (hasCompletions) {
          closeCompletion(view);
        }
        onEnter(view.state.doc.toString(), completionResult);
        return true;
      },
    },
  ];
}

function maybeAcceptEnterCompletion(
  view: EditorView,
  hasCompletions: boolean,
  tabToAutocomplete: boolean,
) {
  // In single-line "submit" inputs (like the Browser path bar) Enter should
  // submit, not silently accept a completion. If a caller wants Enter to
  // accept completions, they should disable tab-to-autocomplete so Enter
  // is the primary completion interaction.
  return hasCompletions && !tabToAutocomplete ? acceptCompletion(view) : false;
}

function getShiftTabKeyBinding(tabBehavior: TabBehavior): Array<KeyBinding> {
  if (tabBehavior.indentWithTab) {
    return [
      {
        key: "Shift-Tab",
        preventDefault: true,
        stopPropagation: true,
        run: (view) => {
          indentLess(view);
          return true;
        },
      },
    ];
  }
  if (!tabBehavior.shouldHandleTabNavigation && !tabBehavior.singleLine) {
    return [];
  }
  return [
    {
      key: "Shift-Tab",
      preventDefault: true,
      stopPropagation: true,
      run: (view) => moveFocus({ direction: -1, from: view.contentDOM }),
    },
  ];
}

function getTabKeyBinding(
  tabBehavior: TabBehavior,
  onTab: GetKeyMapArrayOptions["onTab"],
): Array<KeyBinding> {
  if (!tabBehavior.tabToAutocomplete && !tabBehavior.indentWithTab) {
    return [];
  }

  return [
    {
      key: "Tab",
      preventDefault: false,
      stopPropagation: true,
      run: (view) => handleTabKey(view, tabBehavior, onTab),
    },
  ];
}

function handleTabKey(
  view: EditorView,
  tabBehavior: TabBehavior,
  onTab: GetKeyMapArrayOptions["onTab"],
) {
  const completionResult = maybeAcceptTabCompletion(view, tabBehavior);
  const fallbackResult = completionResult
    ? false
    : handleTabFallback(view, tabBehavior);
  onTab?.(view.state.doc.toString(), completionResult);
  return tabBehavior.indentWithTab || completionResult || fallbackResult;
}

function maybeAcceptTabCompletion(
  view: EditorView,
  { hasCompletions, tabToAutocomplete }: TabBehavior,
) {
  return tabToAutocomplete && hasCompletions ? acceptCompletion(view) : false;
}

function handleTabFallback(view: EditorView, tabBehavior: TabBehavior) {
  if (tabBehavior.indentWithTab) {
    indentMore(view);
    return true;
  }
  if (!tabBehavior.shouldHandleTabNavigation && !tabBehavior.singleLine) {
    return false;
  }
  return moveFocus({ direction: 1, from: view.contentDOM });
}

function getComboKeyBindings(
  keyComboActions: GetKeyMapArrayOptions["keyComboActions"],
): Array<KeyBinding> {
  if (!keyComboActions) {
    return [];
  }
  return Object.entries(keyComboActions).map(([combo, action]) => ({
    key: combo,
    run: (view) => action(view.state.doc.toString()),
  }));
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
}: GetKeyMapArrayOptions): Array<KeyBinding> {
  // we call undo and redo here because in keyActivations,
  // undo/redo are disabled in input fields.
  // But at the same time, we want to override codemirror's undo/redo
  const { shortcuts } = useSettings.getState();
  const tabBehavior = resolveTabBehavior({
    hasCompletions,
    indentWithTab,
    singleLine,
    tabToAutocomplete,
  });
  return [
    ...getBaseKeyBindings(shortcuts, onEscape),
    ...getEnterKeyBinding({ hasCompletions, onEnter, tabToAutocomplete }),
    ...getShiftTabKeyBinding(tabBehavior),
    ...getTabKeyBinding(tabBehavior, onTab),
    ...getComboKeyBindings(keyComboActions),
  ];
}
