import { indentUnit } from "@codemirror/language";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  getTextValueLanguageExtensions,
  type WorkspaceEditorLanguage,
} from "../controls/text/textValueLanguages";

// The reference's `getExtensions` at the shape its section-scale editors reach, minus every
// application service: no LSP completion source or `completionKeymap`, no tooltip parent, no app
// undo/redo shortcut overrides, and no tab-scope focus navigation. What remains is the reference's
// gutter border removal, its line wrapping, its language pack, its read-only state, and its Escape
// binding, plus the authored indentation width this package's contract adds. Both built-in
// content sections compile their editor from here, so the Code Editor and the Text section's edit
// mode cannot drift apart.

// The reference's `CODEMIRROR_GUTTER_LAYOUT_FIX`.
const GUTTER_LAYOUT_FIX = EditorView.baseTheme({
  ".cm-gutters": { borderRight: "0" },
  "&light .cm-gutters": { borderRight: "0" },
  "&dark .cm-gutters": { borderRight: "0" },
});

export type SectionEditorExtensionsOptions = {
  // Plain text is the absence of a language pack rather than a mode of its own, exactly as the
  // reference's `getExtensions` resolves a null language to no support.
  language: WorkspaceEditorLanguage | null;
  wrapLines: boolean;
  indentWidth: number;
  isReadOnly: boolean;
  onEscape: () => void;
};

export function getSectionEditorExtensions({
  language,
  wrapLines,
  indentWidth,
  isReadOnly,
  onEscape,
}: SectionEditorExtensionsOptions): Array<Extension> {
  const extensions: Array<Extension> = [GUTTER_LAYOUT_FIX];
  if (wrapLines) {
    extensions.push(EditorView.lineWrapping);
  }
  extensions.push(...getTextValueLanguageExtensions(language));
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
export function getSectionEditorBasicSetup({ lineNumbers }: { lineNumbers: boolean }) {
  return {
    autocompletion: false,
    // Package-only design decision: the reference always shows both gutters, so the authored
    // line-number option owns the section's whole gutter column rather than leaving a fold
    // rail behind with nothing beside it.
    foldGutter: lineNumbers,
    lineNumbers,
  } as const;
}
