import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { getTextValueLanguageExtensions, type TextValueLanguage } from "./textValueLanguages";

// The reference's `getExtensions` trimmed to the paths its text value editor reaches: line
// wrapping, the declared language pack, the single-line transaction filter, and the Escape
// binding. Autocomplete, tooltip parents, app undo/redo shortcut overrides, and the tab-scope
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

export type TextValueExtensionsOptions = {
  language: TextValueLanguage | null | undefined;
  singleLine: boolean;
  wrapLines: boolean | undefined;
  onEscape: () => void;
};

export function getTextValueExtensions({
  language,
  singleLine,
  wrapLines,
  onEscape,
}: TextValueExtensionsOptions): Array<Extension> {
  const extensions: Array<Extension> = [];
  const shouldWrap = wrapLines ?? !singleLine;
  if (shouldWrap) {
    extensions.push(EditorView.lineWrapping);
  }
  extensions.push(...getTextValueLanguageExtensions(language));
  if (singleLine) {
    extensions.push(EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr)));
  }
  extensions.push(
    Prec.highest(
      keymap.of([
        {
          key: "Escape",
          run: () => {
            onEscape();
            return false;
          },
        },
      ]),
    ),
  );
  return extensions;
}
