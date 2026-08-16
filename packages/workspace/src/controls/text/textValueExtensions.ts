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
import { EditorView, keymap } from "@codemirror/view";
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
// consumer-owned Enter commit seam, and the Escape binding. Autocomplete, tooltip parents, app
// undo/redo shortcut overrides, and the tab-scope
// focus navigation are application services and stay application-side; without a completion
// source Escape always reports (the reference consults `completionStatus` first).

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
  isDisabled?: () => boolean;
  completionProvider?: TextValueCompletionProvider;
  completionRequests?: TextValueCompletionRequests;
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

function isEnter(event: KeyboardEvent) {
  return event.key === "Enter" || event.code === "Enter";
}

function getEnterCommit(
  event: KeyboardEvent,
  view: EditorView,
  {
    singleLine,
    onCommit,
    isDisabled,
  }: Pick<TextValueExtensionsOptions, "singleLine" | "onCommit" | "isDisabled">,
) {
  if (!singleLine || !onCommit || isDisabled?.()) {
    return undefined;
  }
  if (isComposing(event, view) || hasModifier(event) || !isEnter(event)) {
    return undefined;
  }
  return onCommit;
}

export function getTextValueExtensions({
  language,
  singleLine,
  wrapLines,
  onEscape,
  onCommit,
  isDisabled,
  completionProvider,
  completionRequests,
}: TextValueExtensionsOptions): Array<Extension> {
  const extensions: Array<Extension> = [];
  const shouldWrap = wrapLines ?? !singleLine;
  if (shouldWrap) {
    extensions.push(EditorView.lineWrapping);
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
          const completionResult = handleCompletionKeydown(
            event,
            view,
            completionProvider !== undefined,
            isDisabled ?? (() => false),
          );
          if (completionResult !== null) {
            return completionResult;
          }
          return handleEditorKeydown(event, view, {
            isDisabled,
            onCommit,
            onEscape,
            singleLine,
          });
        },
      }),
    ),
  );
  return extensions;
}

function handleCompletionKeydown(
  event: KeyboardEvent,
  view: EditorView,
  hasCompletionProvider: boolean,
  isDisabled: () => boolean,
): boolean | null {
  if (!hasCompletionProvider || completionStatus(view.state) !== "active") {
    return null;
  }
  if (isDisabled()) {
    return handleDisabledCompletionKeydown(event, view);
  }
  if (isEnter(event)) {
    if (isComposing(event, view)) {
      event.stopPropagation();
      return true;
    }
    return runCompletionCommand(event, view, acceptCompletion);
  }
  if (event.key === "Escape" || event.code === "Escape") {
    return runCompletionCommand(event, view, closeCompletion);
  }
  // Arrow and paging bindings stay with CodeMirror's completion keymap. The editor's ordinary
  // Enter commit and Escape-to-section behavior never run while the popup is visible.
  return false;
}

function handleDisabledCompletionKeydown(
  event: KeyboardEvent,
  view: EditorView,
): boolean {
  if (event.key === "Escape" || event.code === "Escape") {
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
    onEscape,
    singleLine,
  }: Pick<
    TextValueExtensionsOptions,
    "isDisabled" | "onCommit" | "onEscape" | "singleLine"
  >,
): boolean {
  if (event.key === "Escape" || event.code === "Escape") {
    event.stopPropagation();
    onEscape();
    return true;
  }
  const commit = getEnterCommit(event, view, {
    singleLine,
    onCommit,
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
    } catch {
      // App providers own failure presentation. The shared adapter simply leaves the popup empty.
      return null;
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
