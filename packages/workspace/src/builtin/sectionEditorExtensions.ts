import { indentUnit } from "@codemirror/language";
import {
  EditorState,
  Prec,
  type Extension,
  type Text,
} from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import {
  getTextValueLanguageExtensions,
  type WorkspaceEditorLanguage,
} from "../controls/text/textValueLanguages";

// The reference's `getExtensions` at the shape its section-scale editors reach, minus every
// application service: no LSP completion source or `completionKeymap`, no tooltip parent, no app
// undo/redo shortcut overrides, and no tab-scope focus navigation. What remains is the reference's
// gutter border removal, its line wrapping, its language pack, its read-only state, and its Escape
// binding, plus the authored indentation width and the non-editable view this package's contract
// adds. Both built-in content sections compile their editor from here, so the Code Editor and the
// Text section's edit mode cannot drift apart.

// The reference's `CODEMIRROR_GUTTER_LAYOUT_FIX`.
const GUTTER_LAYOUT_FIX = EditorView.baseTheme({
  ".cm-gutters": { borderRight: "0" },
  "&light .cm-gutters": { borderRight: "0" },
  "&dark .cm-gutters": { borderRight: "0" },
});

// The three presentations a section-scale editor supports. `editable` is the reference's own code
// area; the other two are non-editable, and `generated-output` additionally paints the section as
// machine-written output.
export type WorkspaceSectionEditorPresentation =
  "editable" | "read-only" | "generated-output";

export function isEditableSectionEditorPresentation(
  presentation: WorkspaceSectionEditorPresentation,
): boolean {
  return presentation === "editable";
}

// The reference's `getGenReadOnlyLineDecorations`: it marks every line of its protected range, and
// marks that range's first and last line so the region can round its ends and hang its badge off
// the block's upper boundary. The reference's range is one part of an otherwise editable document;
// here the whole document is generated, so the same marks run from the document's first rendered
// line to its last. Painting the editor's wrapper instead would fill the section's unused height
// with generated colour and move the badge off the block, which is the presentation this replaces.
//
// This attribute is the package's public hook for observing or capturing the generated block. The
// scoped stylesheet paints from it too, so the block's position vocabulary has one owner.
const GENERATED_LINE_ATTRIBUTE = "data-workspace-generated-line";

function getGeneratedLinePosition(lineNumber: number, lineCount: number) {
  if (lineCount === 1) {
    return "only";
  }
  if (lineNumber === 1) {
    return "start";
  }
  return lineNumber === lineCount ? "end" : "middle";
}

function getGeneratedLineDecorations(doc: Text): DecorationSet {
  return Decoration.set(
    Array.from({ length: doc.lines }, (_unused, index) => {
      const lineNumber = index + 1;
      return Decoration.line({
        attributes: {
          [GENERATED_LINE_ATTRIBUTE]: getGeneratedLinePosition(
            lineNumber,
            doc.lines,
          ),
        },
      }).range(doc.line(lineNumber).from);
    }),
  );
}

// The document is the only input, and a generated section's document is replaced wholesale when
// its host regenerates it, so the marks are recomputed exactly then.
const GENERATED_OUTPUT_LINES = EditorView.decorations.compute(
  ["doc"],
  (state) => getGeneratedLineDecorations(state.doc),
);

type SectionEditorExtensionsOptions = {
  // Plain text is the absence of a language pack rather than a mode of its own, exactly as the
  // reference's `getExtensions` resolves a null language to no support.
  language: WorkspaceEditorLanguage | null;
  wrapLines: boolean;
  indentWidth: number;
  presentation: WorkspaceSectionEditorPresentation;
  onEscape: () => void;
};

export function getSectionEditorExtensions({
  language,
  wrapLines,
  indentWidth,
  presentation,
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
  extensions.push(
    indentUnit.of(" ".repeat(indentWidth)),
    EditorState.tabSize.of(indentWidth),
  );
  // A non-editable section is non-editable in the view as well as in the state. Read-only state
  // alone leaves a focusable `contenteditable` element that only refuses transactions, which is
  // how the rejected candidate showed a caret in a surface nobody can author.
  if (!isEditableSectionEditorPresentation(presentation)) {
    extensions.push(
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    );
  }
  if (presentation === "generated-output") {
    extensions.push(GENERATED_OUTPUT_LINES);
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
export function getSectionEditorBasicSetup({
  lineNumbers,
  presentation,
}: {
  lineNumbers: boolean;
  presentation: WorkspaceSectionEditorPresentation;
}) {
  const isEditable = isEditableSectionEditorPresentation(presentation);
  return {
    autocompletion: false,
    // CodeMirror draws its own selection over a hidden native one, and it only draws the
    // selection the editor itself owns. A non-editable view never takes that selection, so the
    // drawn layer would leave a reader's own selection invisible while they copy it.
    drawSelection: isEditable,
    // Package-only design decision: the reference always shows both gutters, so the authored
    // line-number option owns the section's whole gutter column rather than leaving a fold
    // rail behind with nothing beside it.
    foldGutter: lineNumbers,
    // Generated output has no cursor to follow, so the active-line paint would only mark a
    // line the reader never placed. Ordinary read-only paint is unchanged.
    highlightActiveLine: presentation !== "generated-output",
    highlightActiveLineGutter: presentation !== "generated-output",
    lineNumbers,
  } as const;
}
