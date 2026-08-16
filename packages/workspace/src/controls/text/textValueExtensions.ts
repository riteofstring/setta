import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  getTextValueLanguageExtensions,
  type TextValueLanguage,
} from "./textValueLanguages";

// The reference's `getExtensions` trimmed to the paths its text value editor reaches: line
// wrapping, the declared language pack, the single-line transaction filter, the optional
// consumer-owned Enter commit seam, and the Escape binding. Autocomplete, tooltip parents, app
// undo/redo shortcut overrides, and the tab-scope
// focus navigation are application services and stay application-side; without a completion
// source Escape always reports (the reference consults `completionStatus` first).

// `@uiw/react-codemirror` otherwise enables its bundled autocompletion extension by default.
// Keep that implicit source off: the approved package surface owns syntax highlighting only,
// while frozen main disables completion for names and supplies value completions through its
// application/backend service.
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
  extensions.push(
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event, view) => {
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
        },
      }),
    ),
  );
  return extensions;
}
