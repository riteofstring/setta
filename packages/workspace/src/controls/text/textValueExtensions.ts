import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { getTextValueLanguageExtensions, type TextValueLanguage } from "./textValueLanguages";

// The reference's `getExtensions` trimmed to the paths its text value editor reaches: line
// wrapping, the declared language pack, the single-line transaction filter, and the Escape
// binding. Autocomplete, tooltip parents, app undo/redo shortcut overrides, and the tab-scope
// focus navigation are application services and stay application-side; without a completion
// source Escape always reports (the reference consults `completionStatus` first).

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
