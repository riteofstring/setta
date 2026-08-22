import { indentUnit } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Prec,
  StateField,
  Transaction,
  type ChangeDesc,
  type Extension,
  type Text,
  type TransactionSpec,
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
// area; `read-only` is that surface without an editing seat; and `generated-document` is the
// reference's generated Python area — ordinary editable text around one declared region of
// machine-written output that refuses every edit touching it. The region travels with the
// presentation that paints it, so no caller can select generated paint without saying where it
// goes, and `outerEditable` is how a locked section keeps that paint while accepting nothing.
export type WorkspaceSectionEditorPresentation =
  | { mode: "editable" }
  | { mode: "read-only" }
  | {
      mode: "generated-document";
      outerEditable: boolean;
      region: WorkspaceGeneratedRegion;
    };

export const EDITABLE_SECTION_EDITOR_PRESENTATION: WorkspaceSectionEditorPresentation =
  { mode: "editable" };
export const READ_ONLY_SECTION_EDITOR_PRESENTATION: WorkspaceSectionEditorPresentation =
  { mode: "read-only" };

// What one accepted edit tells the section that owns the document: the next text and, for a
// generated document, the protected range mapped through that same edit. Both belong to the
// section's data, and no CodeMirror type crosses this seam to reach it.
export type WorkspaceSectionEditorChange = Readonly<{
  generatedRegion: WorkspaceGeneratedRegion | null;
  text: string;
}>;

// The compiled editor: its extensions, and the reader that answers what the protected range has
// become. They are built together because the range lives in editor state, so the caller cannot
// have one without the other.
type WorkspaceSectionEditorCompilation = Readonly<{
  extensions: Array<Extension>;
  readGeneratedRegion: (state: EditorState) => WorkspaceGeneratedRegion | null;
}>;

const NO_GENERATED_REGION = () => null;

// A generated document is an editing surface unless its section is locked; the other two modes
// state it outright.
export function isSectionEditorEditable(
  presentation: WorkspaceSectionEditorPresentation,
): boolean {
  return presentation.mode === "generated-document"
    ? presentation.outerEditable
    : presentation.mode === "editable";
}

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

// The region is validated against the same string the document renders. It is still clamped
// where it is read, because a host that regenerates code and region together reaches CodeMirror
// as a document update and a reconfiguration, and one arrives first.
function clampGeneratedRegion(
  doc: Text,
  region: WorkspaceGeneratedRegion,
): WorkspaceGeneratedRegion {
  return {
    from: Math.min(region.from, doc.length),
    to: Math.min(region.to, doc.length),
  };
}

function getGeneratedBlockLines(doc: Text, region: WorkspaceGeneratedRegion) {
  const { from, to } = clampGeneratedRegion(doc, region);
  const firstNumber = doc.lineAt(from).number;
  const lastNumber = doc.lineAt(to).number;
  const lines = [];
  for (let number = firstNumber; number <= lastNumber; number += 1) {
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

// The document and the range it holds are the only inputs, so the marks follow both an accepted
// outer edit and a host's whole-document regeneration.
function getGeneratedLineExtension(
  field: StateField<WorkspaceGeneratedRegion>,
): Extension {
  return EditorView.decorations.compute([field, "doc"], (state) =>
    getGeneratedLineDecorations(state.doc, state.field(field)),
  );
}

// The protected range is editor state rather than a render prop: an accepted outer edit moves it,
// and that same mapped value decides what the next transaction may touch, which lines the block
// paints, and what the host is told to persist.
function createGeneratedRegionField(region: WorkspaceGeneratedRegion) {
  return StateField.define<WorkspaceGeneratedRegion>({
    create: () => region,
    update: (value, transaction) =>
      transaction.docChanged && isUserTransaction(transaction)
        ? mapGeneratedRegion(value, transaction.changes)
        : value,
  });
}

// Boundary insertions belong to the outer text, exactly as the reference's separator-bounded range
// does: the block starts after text inserted at its start and ends before text inserted at its
// end, so the region never drifts into what somebody just authored.
function mapGeneratedRegion(
  region: WorkspaceGeneratedRegion,
  changes: ChangeDesc,
): WorkspaceGeneratedRegion {
  return {
    from: changes.mapPos(region.from, 1),
    to: changes.mapPos(region.to, -1),
  };
}

// A user transaction is the only kind this editor refuses or maps. A host's canonical replacement
// carries the next text and the next region together, so mapping it through the replacement it
// brought would only destroy the range it just declared. The reference's own generated area makes
// the same `Transaction.userEvent` distinction.
function isUserTransaction(transaction: Transaction): boolean {
  return transaction.annotation(Transaction.userEvent) !== undefined;
}

// The reference's `readOnlyGeneratedRange`: a user transaction is accepted only when every one of
// its changes lies wholly before or wholly after the protected range, so typing, paste, cut,
// deletion, replacement, undo, and redo across it are refused as a whole rather than partly
// applied.
function getGeneratedRegionProtection(
  field: StateField<WorkspaceGeneratedRegion>,
): Extension {
  return Prec.highest(
    EditorState.transactionFilter.of((transaction) => {
      const region = transaction.startState.field(field);
      if (!transaction.docChanged) {
        return keepCaretOutsideRegion(transaction, region);
      }
      return !isUserTransaction(transaction) ||
        acceptsEveryChange(transaction, region)
        ? transaction
        : [];
    }),
  );
}

function acceptsEveryChange(
  transaction: Transaction,
  region: WorkspaceGeneratedRegion,
): boolean {
  let accepted = true;
  transaction.changes.iterChanges((from, to) => {
    if (from < region.to && to > region.from) {
      accepted = false;
    }
  });
  return accepted;
}

// A caret marks where the next character would go, and inside the protected range there is
// nowhere for one to go. Cursor motion already steps over the whole block, so this answers the
// pointer press that lands in the middle of it: the caret takes the nearer end. A selection that
// spans the block is left alone, because the generated output stays selectable and copyable.
function keepCaretOutsideRegion(
  transaction: Transaction,
  region: WorkspaceGeneratedRegion,
): TransactionSpec | ReadonlyArray<TransactionSpec> {
  const caret = transaction.newSelection.main;
  if (!caret.empty || caret.head <= region.from || caret.head >= region.to) {
    return transaction;
  }
  const nearestEdge =
    caret.head - region.from <= region.to - caret.head
      ? region.from
      : region.to;
  return [transaction, { selection: EditorSelection.cursor(nearestEdge) }];
}

// The block is one thing to the keyboard: arrow and word motion step over it instead of walking
// through text that refuses every edit, which is also what keeps the caret out of it without
// trapping the keyboard between the prefix and the suffix.
const PROTECTED_RANGE_MARK = Decoration.mark({});

function getGeneratedRegionCursorSkip(
  field: StateField<WorkspaceGeneratedRegion>,
): Extension {
  return EditorView.atomicRanges.of((view) => {
    const { from, to } = clampGeneratedRegion(
      view.state.doc,
      view.state.field(field),
    );
    return from < to
      ? Decoration.set(PROTECTED_RANGE_MARK.range(from, to))
      : Decoration.none;
  });
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
}: SectionEditorExtensionsOptions): WorkspaceSectionEditorCompilation {
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
  if (!isSectionEditorEditable(presentation)) {
    extensions.push(
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    );
  }
  let readGeneratedRegion: WorkspaceSectionEditorCompilation["readGeneratedRegion"] =
    NO_GENERATED_REGION;
  if (presentation.mode === "generated-document") {
    const region = createGeneratedRegionField(presentation.region);
    extensions.push(region, getGeneratedLineExtension(region));
    if (presentation.outerEditable) {
      extensions.push(
        getGeneratedRegionProtection(region),
        getGeneratedRegionCursorSkip(region),
      );
    }
    readGeneratedRegion = (state) => state.field(region, false) ?? null;
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
  return { extensions, readGeneratedRegion };
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
  const isEditable = isSectionEditorEditable(presentation);
  // A locked generated document is the one surface with no seat at all: it keeps the block's
  // paint while nobody can place a cursor in it, so the active-line highlight would only mark a
  // line the reader never chose.
  const isGeneratedReader =
    presentation.mode === "generated-document" && !presentation.outerEditable;
  return {
    autocompletion: false,
    // CodeMirror draws its own selection over a hidden native one, and it only draws the
    // selection the editor itself owns. A non-editable view never takes that selection, so the
    // drawn layer would leave a reader's own selection invisible while they copy it. A generated
    // document keeps the native selection for the same reason the reference's code areas do: its
    // block paints selected generated output through an ordinary `::selection` rule.
    drawSelection: isEditable && presentation.mode !== "generated-document",
    // Package-only design decision: the reference always shows both gutters, so the authored
    // line-number option owns the section's whole gutter column rather than leaving a fold
    // rail behind with nothing beside it.
    foldGutter: lineNumbers,
    highlightActiveLine: !isGeneratedReader,
    highlightActiveLineGutter: !isGeneratedReader,
    lineNumbers,
  } as const;
}
