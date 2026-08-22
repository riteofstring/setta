import { EditorState, Prec, type Extension } from "@codemirror/state";
import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionKeymap,
  completionStatus,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView, keymap, tooltips } from "@codemirror/view";
import {
  getTextValueLanguageExtensions,
  type TextValueLanguage,
} from "./textValueLanguages";
import type {
  TextValueCompletionProvider,
  TextValueCompletionResult,
} from "./textValueCompletion";

// The reference's `getExtensions` trimmed to the paths its text value editor reaches: line
// wrapping, the declared language pack, the single-line transaction filter, the optional
// consumer-owned Enter commit seam, the Escape binding, the reference's Tab-accepts-completion
// binding, and the reference's canvas tooltip parent. App undo/redo shortcut overrides and the
// reference's tab-scope focus manager are application services and stay application-side, so Tab
// outside an open popup remains the browser's own focus move; without a completion source Escape
// always reports (the reference consults `completionStatus` first).

// `@uiw/react-codemirror` otherwise enables its bundled autocompletion extension by default.
// Keep that implicit source off. A supplied consumer-neutral provider installs the narrow
// adapter below; the default editor remains syntax highlighting only.
export const TEXT_VALUE_BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  tabSize: 4,
  autocompletion: false,
} as const;

type TextValueExtensionsOptions = {
  language: TextValueLanguage | null | undefined;
  singleLine: boolean;
  wrapLines: boolean | undefined;
  onEscape: () => void;
  onCommit?: (value: string) => void;
  onAlternateCommit?: (value: string) => void;
  isDisabled?: () => boolean;
  completionProvider?: TextValueCompletionProvider;
  completionRequests?: TextValueCompletionRequests;
  // The canvas's own tooltip parent, resolved from the host rather than passed by a consumer. It
  // is null only for an editor rendered with no canvas, which is also a tree with no section
  // clipping the popup this would move out of.
  tooltipParent: HTMLElement | null;
};

type TextValueCompletionRequests = {
  abort: () => void;
  clear: (controller: AbortController) => void;
  start: () => AbortController;
};

function isComposing(event: KeyboardEvent, view: EditorView) {
  return event.isComposing || view.composing;
}

function hasModifier(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function isAlternateCommit(event: KeyboardEvent) {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function isEnter(event: KeyboardEvent) {
  return event.key === "Enter" || event.code === "Enter";
}

function isEscape(event: KeyboardEvent) {
  return event.key === "Escape" || event.code === "Escape";
}

function isTab(event: KeyboardEvent) {
  return event.key === "Tab" || event.code === "Tab";
}

function getEnterCommit(
  event: KeyboardEvent,
  view: EditorView,
  {
    singleLine,
    onCommit,
    onAlternateCommit,
    isDisabled,
  }: Pick<
    TextValueExtensionsOptions,
    "singleLine" | "onCommit" | "onAlternateCommit" | "isDisabled"
  >,
) {
  if (!singleLine || isDisabled?.()) {
    return undefined;
  }
  if (isComposing(event, view) || !isEnter(event)) {
    return undefined;
  }
  if (!hasModifier(event)) {
    return onCommit;
  }
  return isAlternateCommit(event) ? onAlternateCommit : undefined;
}

export function getTextValueExtensions({
  language,
  singleLine,
  wrapLines,
  onEscape,
  onCommit,
  onAlternateCommit,
  isDisabled,
  completionProvider,
  completionRequests,
  tooltipParent,
}: TextValueExtensionsOptions): Array<Extension> {
  const extensions: Array<Extension> = [];
  const shouldWrap = wrapLines ?? !singleLine;
  if (shouldWrap) {
    extensions.push(EditorView.lineWrapping);
  }
  if (tooltipParent) {
    extensions.push(tooltips({ parent: tooltipParent }));
  }
  extensions.push(...getTextValueLanguageExtensions(language));
  if (singleLine) {
    extensions.push(
      EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr)),
    );
  }
  if (completionProvider && completionRequests) {
    extensions.push(
      autocompletion({
        defaultKeymap: false,
        interactionDelay: 0,
        override: [
          completionSource(
            completionProvider,
            completionRequests,
            isDisabled ?? (() => false),
          ),
        ],
      }),
      Prec.high(keymap.of(completionKeymap)),
    );
  }
  extensions.push(
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event, view) => {
          const completionResult = handleCompletionKeydown(event, view, {
            hasCompletionProvider: completionProvider !== undefined,
            isDisabled: isDisabled ?? (() => false),
            onCommit,
            onAlternateCommit,
            singleLine,
          });
          if (completionResult !== null) {
            return completionResult;
          }
          return handleEditorKeydown(event, view, {
            isDisabled,
            onCommit,
            onAlternateCommit,
            onEscape,
            singleLine,
          });
        },
      }),
    ),
  );
  return extensions;
}

// Main's callable search gives an active completion popup the first unmodified Enter. Accepting
// the selected option updates only the draft; the next Enter, after the popup closes, reaches the
// declared commit. Tab accepts the same way, Escape closes the popup, and Alt-Enter remains the
// caller's explicit alternate commit even while a popup is visible.
function handleCompletionKeydown(
  event: KeyboardEvent,
  view: EditorView,
  {
    hasCompletionProvider,
    isDisabled,
    onCommit,
    onAlternateCommit,
    singleLine,
  }: Pick<
    TextValueExtensionsOptions,
    "onCommit" | "onAlternateCommit" | "singleLine"
  > & {
    hasCompletionProvider: boolean;
    isDisabled: () => boolean;
  },
): boolean | null {
  if (!hasCompletionProvider || completionStatus(view.state) !== "active") {
    return null;
  }
  if (isDisabled()) {
    return handleDisabledCompletionKeydown(event, view);
  }
  if (isTab(event) && !hasModifier(event)) {
    return runCompletionCommand(event, view, acceptCompletion);
  }
  if (isEscape(event)) {
    return runCompletionCommand(event, view, closeCompletion);
  }
  if (isEnter(event)) {
    return handleCompletionEnter(event, view, {
      isDisabled,
      onCommit,
      onAlternateCommit,
      singleLine,
    });
  }
  // Arrow and paging bindings stay with CodeMirror's completion keymap. The editor's ordinary
  // Escape-to-section behavior never runs while the popup is visible.
  return false;
}

function handleCompletionEnter(
  event: KeyboardEvent,
  view: EditorView,
  {
    isDisabled,
    onCommit,
    onAlternateCommit,
    singleLine,
  }: Pick<
    TextValueExtensionsOptions,
    "isDisabled" | "onCommit" | "onAlternateCommit" | "singleLine"
  >,
): boolean | null {
  if (isComposing(event, view)) {
    event.stopPropagation();
    return true;
  }
  if (!hasModifier(event)) {
    return runCompletionCommand(event, view, acceptCompletion);
  }
  const commit = getEnterCommit(event, view, {
    singleLine,
    onCommit,
    onAlternateCommit,
    isDisabled,
  });
  if (!commit) {
    return false;
  }
  // Main's modified alternate gesture belongs to the caller, not the popup.
  closeCompletion(view);
  return null;
}

function handleDisabledCompletionKeydown(
  event: KeyboardEvent,
  view: EditorView,
): boolean {
  if (isEscape(event)) {
    return runCompletionCommand(event, view, closeCompletion);
  }
  if (isEnter(event)) {
    event.preventDefault();
    event.stopPropagation();
  }
  return true;
}

function runCompletionCommand(
  event: KeyboardEvent,
  view: EditorView,
  command: (view: EditorView) => boolean,
): boolean {
  event.preventDefault();
  event.stopPropagation();
  return command(view);
}

function handleEditorKeydown(
  event: KeyboardEvent,
  view: EditorView,
  {
    isDisabled,
    onCommit,
    onAlternateCommit,
    onEscape,
    singleLine,
  }: Pick<
    TextValueExtensionsOptions,
    "isDisabled" | "onCommit" | "onAlternateCommit" | "onEscape" | "singleLine"
  >,
): boolean {
  if (isEscape(event)) {
    event.stopPropagation();
    onEscape();
    return true;
  }
  const commit = getEnterCommit(event, view, {
    singleLine,
    onCommit,
    onAlternateCommit,
    isDisabled,
  });
  if (!commit) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  commit(view.state.doc.toString());
  return true;
}

function completionSource(
  provider: TextValueCompletionProvider,
  requests: TextValueCompletionRequests,
  isDisabled: () => boolean,
) {
  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    if (isDisabled()) {
      return null;
    }
    const controller = requests.start();
    context.addEventListener(
      "abort",
      () => {
        controller.abort();
      },
      { onDocChange: true },
    );
    try {
      const result = await provider({
        cursorOffset: context.pos,
        explicit: context.explicit,
        signal: controller.signal,
        value: context.state.doc.toString(),
      });
      if (
        result === null ||
        context.aborted ||
        controller.signal.aborted ||
        isDisabled()
      ) {
        return null;
      }
      return completionResultForEditor(result, context);
    } finally {
      requests.clear(controller);
    }
  };
}

function completionResultForEditor(
  result: TextValueCompletionResult,
  context: CompletionContext,
): CompletionResult | null {
  const to = result.to ?? context.pos;
  const documentLength = context.state.doc.length;
  if (
    !Number.isInteger(result.from) ||
    !Number.isInteger(to) ||
    result.from < 0 ||
    to < result.from ||
    to > documentLength
  ) {
    return null;
  }
  const options = result.options.flatMap((option) => {
    if (option.label.trim() === "") {
      return [];
    }
    const insertText = option.insertText ?? option.label;
    if (insertText.trim() === "") {
      return [];
    }
    return [{ apply: insertText, label: option.label }];
  });
  return { from: result.from, to, options };
}
