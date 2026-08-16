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
import type { WorkspaceGeneratedRegion } from "./codeSectionData";

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
// area; the other two are non-editable, and `generated-document` additionally paints one declared
// region of the document as machine-written output. The region travels with the presentation that
// paints it, so no caller can select generated paint without saying where it goes.
export type WorkspaceSectionEditorPresentation =
  | { mode: "editable" }
  | { mode: "read-only" }
  | { mode: "generated-document"; region: WorkspaceGeneratedRegion };

export const EDITABLE_SECTION_EDITOR_PRESENTATION: WorkspaceSectionEditorPresentation =
  { mode: "editable" };
export const READ_ONLY_SECTION_EDITOR_PRESENTATION: WorkspaceSectionEditorPresentation =
  { mode: "read-only" };

// The reference's `getGenReadOnlyLineDecorations`: it marks every line its protected range covers,
// and marks that range's first and last line so the region can round its ends and hang its badge
// off the block's upper boundary. The range runs from the end of the text before it to the start
// of the text after it, so those two boundary lines carry the partial geometry while the lines
// that only touch the range at a boundary keep ordinary read-only paint.
//
// This attribute is the package's public hook for observing or capturing the generated block. The
// scoped stylesheet paints from it too, so the block's position vocabulary has one owner.
const GENERATED_LINE_ATTRIBUTE = "data-workspace-generated-line";

function getGeneratedLinePosition(index: number, lineCount: number) {
  if (lineCount === 1) {
    return "only";
  }
  if (index === 0) {
    return "start";
  }
  return index === lineCount - 1 ? "end" : "middle";
}

function getGeneratedBlockLines(doc: Text, region: WorkspaceGeneratedRegion) {
  // The region is validated against the same string the document renders. It is still clamped
  // here because a host that regenerates code and region together reaches CodeMirror as a
  // document update and a reconfiguration, and one arrives first.
  const from = Math.min(region.from, doc.length);
  const to = Math.min(region.to, doc.length);
  const lines = [];
  for (
    let number = doc.lineAt(from).number;
    number <= doc.lineAt(to).number;
    number += 1
  ) {
    const line = doc.line(number);
    // A line joins the block when the region covers part of it or spans across it. The line the
    // region starts at the end of, and the line it ends at the start of, are the surrounding
    // text and stay on the ordinary surface.
    if (line.to > from && line.from < to) {
      lines.push(line);
    }
  }
  return lines;
}

function getGeneratedLineDecorations(
  doc: Text,
  region: WorkspaceGeneratedRegion,
): DecorationSet {
  const lines = getGeneratedBlockLines(doc, region);
  return Decoration.set(
    lines.map((line, index) =>
      Decoration.line({
        attributes: {
          [GENERATED_LINE_ATTRIBUTE]: getGeneratedLinePosition(
            index,
            lines.length,
          ),
        },
      }).range(line.from),
    ),
  );
}

// The document and the declared region are the only inputs, and a generated section's document is
// replaced wholesale when its host regenerates it, so the marks are recomputed exactly then.
function getGeneratedLineExtension(region: WorkspaceGeneratedRegion) {
  return EditorView.decorations.compute(["doc"], (state) =>
    getGeneratedLineDecorations(state.doc, region),
  );
}

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
  if (presentation.mode !== "editable") {
    extensions.push(
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    );
  }
  if (presentation.mode === "generated-document") {
    extensions.push(getGeneratedLineExtension(presentation.region));
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
  const isEditable = presentation.mode === "editable";
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
    // A generated document has no cursor to follow, so the active-line paint would only mark a
    // line the reader never placed. Ordinary read-only paint is unchanged.
    highlightActiveLine: presentation.mode !== "generated-document",
    highlightActiveLineGutter: presentation.mode !== "generated-document",
    lineNumbers,
  } as const;
}
