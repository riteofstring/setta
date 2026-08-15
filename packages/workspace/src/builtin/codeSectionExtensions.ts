import { indentUnit } from "@codemirror/language";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getTextValueLanguageExtensions } from "../controls/text/textValueLanguages";
import {
  getWorkspaceCodeSectionEditorLanguage,
  type WorkspaceCodeSectionData,
} from "./codeSectionData";

// The reference's `getExtensions` at the shape its code area reaches, minus every application
// service: no LSP completion source or `completionKeymap`, no tooltip parent, no app undo/redo
// shortcut overrides, and no tab-scope focus navigation. What remains is the reference's gutter
// border removal, its line wrapping, its language pack, its read-only state, and its Escape
// binding, plus the authored indentation width this package's contract adds.

// The reference's `CODEMIRROR_GUTTER_LAYOUT_FIX`.
const GUTTER_LAYOUT_FIX = EditorView.baseTheme({
  ".cm-gutters": { borderRight: "0" },
  "&light .cm-gutters": { borderRight: "0" },
  "&dark .cm-gutters": { borderRight: "0" },
});

export type CodeSectionExtensionsOptions = Pick<
  WorkspaceCodeSectionData,
  "language" | "wrapLines" | "indentWidth"
> & {
  isReadOnly: boolean;
  onEscape: () => void;
};

export function getCodeSectionExtensions({
  language,
  wrapLines,
  indentWidth,
  isReadOnly,
  onEscape,
}: CodeSectionExtensionsOptions): Array<Extension> {
  const extensions: Array<Extension> = [GUTTER_LAYOUT_FIX];
  if (wrapLines) {
    extensions.push(EditorView.lineWrapping);
  }
  extensions.push(
    ...getTextValueLanguageExtensions(getWorkspaceCodeSectionEditorLanguage(language)),
  );
  // One owner for the authored width: the reference reaches `indentUnit` through its
  // `basicSetup.tabSize` option, which leaves a literal tab rendering at CodeMirror's own
  // default. Setting both here keeps inserted and existing indentation the same width.
  extensions.push(indentUnit.of(" ".repeat(indentWidth)), EditorState.tabSize.of(indentWidth));
  if (isReadOnly) {
    extensions.push(EditorState.readOnly.of(true));
  }
  // The editor owns Escape ahead of the workspace's own chords: the reference's code area
  // returns focus to its wrapper, and letting the same keypress continue would clear the
  // selection the wrapper was just given. The reference consults `completionStatus` first;
  // the package ships no completion source, so Escape always leaves.
  extensions.push(
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event) => {
          if (event.key === "Escape" || event.code === "Escape") {
            event.stopPropagation();
            onEscape();
            return true;
          }
          return false;
        },
      }),
    ),
  );
  return extensions;
}

// `@uiw/react-codemirror` enables its bundled autocompletion by default, and the reference's
// non-Python code areas inherit exactly that implicit source. This milestone keeps implicit
// completion off; the package ships no completion source, so there is no enabled state to
// configure and no completion key for the editor to own.
export function getCodeSectionBasicSetup({
  lineNumbers,
}: Pick<WorkspaceCodeSectionData, "lineNumbers">) {
  return {
    autocompletion: false,
    // Package-only design decision: the reference always shows both gutters, so the authored
    // line-number option owns the section's whole gutter column rather than leaving a fold
    // rail behind with nothing beside it.
    foldGutter: lineNumbers,
    lineNumbers,
  } as const;
}
