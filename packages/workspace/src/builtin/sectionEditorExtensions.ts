import { indentUnit } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionKeymap,
  completionStatus,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
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
import {
  Decoration,
  EditorView,
  keymap,
  tooltips,
  type DecorationSet,
} from "@codemirror/view";
import {
  getTextValueLanguageExtensions,
  type WorkspaceEditorLanguage,
} from "../controls/text/textValueLanguages";
import type {
  WorkspaceCodeSectionDiagnostic,
  WorkspaceCodeSectionLanguage,
  WorkspaceGeneratedRegion,
} from "./codeSectionData";
import type {
  WorkspaceCodeSectionCompletionOption,
  WorkspaceCodeSectionCompletionProvider,
  WorkspaceCodeSectionCompletionResult,
} from "./codeSectionCompletion";

const GUTTER_LAYOUT_FIX = EditorView.baseTheme({
  ".cm-gutters": { borderRight: "0" },
  "&light .cm-gutters": { borderRight: "0" },
  "&dark .cm-gutters": { borderRight: "0" },
});

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

export type WorkspaceSectionEditorChange = Readonly<{
  generatedRegion: WorkspaceGeneratedRegion | null;
  text: string;
}>;

type WorkspaceSectionEditorCompilation = Readonly<{
  extensions: Array<Extension>;
  readGeneratedRegion: (state: EditorState) => WorkspaceGeneratedRegion | null;
}>;

const NO_GENERATED_REGION = () => null;

export function isSectionEditorEditable(
  presentation: WorkspaceSectionEditorPresentation,
): boolean {
  return presentation.mode === "generated-document"
    ? presentation.outerEditable
    : presentation.mode === "editable";
}

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

function getGeneratedLineExtension(
  field: StateField<WorkspaceGeneratedRegion>,
): Extension {
  return EditorView.decorations.compute([field, "doc"], (state) =>
    getGeneratedLineDecorations(state.doc, state.field(field)),
  );
}

function createGeneratedRegionField(region: WorkspaceGeneratedRegion) {
  return StateField.define<WorkspaceGeneratedRegion>({
    create: () => region,
    update: (value, transaction) =>
      transaction.docChanged && isUserTransaction(transaction)
        ? mapGeneratedRegion(value, transaction.changes)
        : value,
  });
}

function mapGeneratedRegion(
  region: WorkspaceGeneratedRegion,
  changes: ChangeDesc,
): WorkspaceGeneratedRegion {
  return {
    from: changes.mapPos(region.from, 1),
    to: changes.mapPos(region.to, -1),
  };
}

function isUserTransaction(transaction: Transaction): boolean {
  return transaction.annotation(Transaction.userEvent) !== undefined;
}

const HOST_SYNCHRONIZATION_OUT_OF_HISTORY = EditorState.transactionExtender.of(
  (transaction) =>
    transaction.docChanged && !isUserTransaction(transaction)
      ? { annotations: Transaction.addToHistory.of(false) }
      : null,
);

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
  language: WorkspaceEditorLanguage | null;
  wrapLines: boolean;
  indentWidth: number;
  diagnostics: ReadonlyArray<WorkspaceCodeSectionDiagnostic>;
  presentation: WorkspaceSectionEditorPresentation;
  onEscape: () => void;
  onSubmit: ((change: WorkspaceSectionEditorChange) => void) | undefined;
  sectionId: string;
  completionLanguage: WorkspaceCodeSectionLanguage;
  completionProvider: WorkspaceCodeSectionCompletionProvider | undefined;
  completionRequests: SectionEditorCompletionRequests;
  tooltipParent: HTMLElement | null;
};

type SectionEditorCompletionRequests = {
  abort: () => void;
  clear: (controller: AbortController) => void;
  start: () => AbortController;
};

export function getSectionEditorExtensions({
  language,
  wrapLines,
  indentWidth,
  diagnostics,
  presentation,
  onEscape,
  onSubmit,
  sectionId,
  completionLanguage,
  completionProvider,
  completionRequests,
  tooltipParent,
}: SectionEditorExtensionsOptions): WorkspaceSectionEditorCompilation {
  const extensions: Array<Extension> = [
    GUTTER_LAYOUT_FIX,
    HOST_SYNCHRONIZATION_OUT_OF_HISTORY,
  ];
  if (wrapLines) {
    extensions.push(EditorView.lineWrapping);
  }
  extensions.push(...getTextValueLanguageExtensions(language));
  if (diagnostics.length > 0) {
    extensions.push(
      linter(
        () =>
          diagnostics.map(
            (diagnostic) => ({ ...diagnostic }) satisfies Diagnostic,
          ),
        { delay: 0 },
      ),
    );
  }

  extensions.push(
    indentUnit.of(" ".repeat(indentWidth)),
    EditorState.tabSize.of(indentWidth),
  );

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
  const enabledCompletionProvider = isSectionEditorEditable(presentation)
    ? completionProvider
    : undefined;
  const enabledSubmit = getEnabledSectionEditorSubmit(presentation, onSubmit);
  const completionEnabled = enabledCompletionProvider !== undefined;
  if (enabledCompletionProvider !== undefined) {
    if (tooltipParent !== null) {
      extensions.push(tooltips({ parent: tooltipParent }));
    }
    extensions.push(
      autocompletion({
        defaultKeymap: false,
        interactionDelay: 0,
        override: [
          getSectionCompletionSource({
            completionLanguage,
            completionProvider: enabledCompletionProvider,
            completionRequests,
            readGeneratedRegion,
            sectionId,
          }),
        ],
      }),
      Prec.high(keymap.of(completionKeymap)),
    );
  }

  extensions.push(
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event, view) =>
          handleSectionEditorKeydown(event, view, {
            completionEnabled,
            onEscape,
            onSubmit: enabledSubmit,
            readGeneratedRegion,
          }),
      }),
    ),
  );
  return { extensions, readGeneratedRegion };
}

function getEnabledSectionEditorSubmit(
  presentation: WorkspaceSectionEditorPresentation,
  onSubmit: ((change: WorkspaceSectionEditorChange) => void) | undefined,
) {
  return isSectionEditorEditable(presentation) ? onSubmit : undefined;
}

function handleSectionEditorKeydown(
  event: KeyboardEvent,
  view: EditorView,
  options: {
    completionEnabled: boolean;
    onEscape: () => void;
    onSubmit: ((change: WorkspaceSectionEditorChange) => void) | undefined;
    readGeneratedRegion: WorkspaceSectionEditorCompilation["readGeneratedRegion"];
  },
): boolean {
  if (options.onSubmit !== undefined && isSectionEditorSubmitKey(event, view)) {
    event.preventDefault();
    event.stopPropagation();
    options.onSubmit({
      generatedRegion: options.readGeneratedRegion(view.state),
      text: view.state.doc.toString(),
    });
    return true;
  }
  const completionResult = handleSectionCompletionKeydown(event, {
    completionEnabled: options.completionEnabled,
    view,
  });
  if (completionResult !== null) {
    return completionResult;
  }
  if (event.key !== "Escape" && event.code !== "Escape") {
    return false;
  }
  event.stopPropagation();
  options.onEscape();
  return true;
}

function isSectionEditorSubmitKey(
  event: KeyboardEvent,
  view: EditorView,
): boolean {
  return (
    !event.isComposing &&
    !view.composing &&
    !event.altKey &&
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    (event.key === "Enter" || event.code === "Enter")
  );
}

function getSectionCompletionSource({
  completionLanguage,
  completionProvider,
  completionRequests,
  readGeneratedRegion,
  sectionId,
}: {
  completionLanguage: WorkspaceCodeSectionLanguage;
  completionProvider: WorkspaceCodeSectionCompletionProvider;
  completionRequests: SectionEditorCompletionRequests;
  readGeneratedRegion: WorkspaceSectionEditorCompilation["readGeneratedRegion"];
  sectionId: string;
}) {
  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const generatedRegion = readGeneratedRegion(context.state);

    if (
      generatedRegion !== null &&
      context.pos > generatedRegion.from &&
      context.pos < generatedRegion.to
    ) {
      return null;
    }
    const controller = completionRequests.start();
    context.addEventListener(
      "abort",
      () => {
        controller.abort();
      },
      { onDocChange: true },
    );
    try {
      const result = await completionProvider({
        cursorOffsetUtf16: context.pos,
        generatedRegion,
        language: completionLanguage,
        sectionId,
        signal: controller.signal,
        text: context.state.doc.toString(),
        trigger: context.explicit ? "explicit" : "typing",
      });
      if (result === null || context.aborted || controller.signal.aborted) {
        return null;
      }
      return completionResultForSectionEditor(result, context, generatedRegion);
    } finally {
      completionRequests.clear(controller);
    }
  };
}

function completionResultForSectionEditor(
  result: unknown,
  context: CompletionContext,
  generatedRegion: WorkspaceGeneratedRegion | null,
): CompletionResult | null {
  const documentLength = context.state.doc.length;
  if (!isWorkspaceCodeSectionCompletionResult(result)) {
    return null;
  }
  if (!isValidCompletionRange(result, documentLength)) {
    return null;
  }
  if (completionTouchesGeneratedRegion(result, generatedRegion)) {
    return null;
  }
  const options = normalizeCompletionOptions(result.options);
  if (options === null) {
    return null;
  }
  return { from: result.from, options, to: result.to };
}

function isValidCompletionRange(
  result: WorkspaceCodeSectionCompletionResult,
  documentLength: number,
) {
  return [
    Number.isSafeInteger(result.from),
    Number.isSafeInteger(result.to),
    result.from >= 0,
    result.to >= result.from,
    result.to <= documentLength,
  ].every(Boolean);
}

function completionTouchesGeneratedRegion(
  result: WorkspaceCodeSectionCompletionResult,
  generatedRegion: WorkspaceGeneratedRegion | null,
) {
  if (generatedRegion === null) {
    return false;
  }
  return [
    result.from < generatedRegion.to,
    result.to > generatedRegion.from,
  ].every(Boolean);
}

function normalizeCompletionOptions(
  options: readonly WorkspaceCodeSectionCompletionOption[],
): Array<{ apply: string; label: string }> | null {
  const normalized: Array<{ apply: string; label: string }> = [];
  for (const option of options) {
    const next = normalizeCompletionOption(option);
    if (next === null) {
      return null;
    }
    normalized.push(next);
  }
  return normalized.length === 0 ? null : normalized;
}

function normalizeCompletionOption(
  option: unknown,
): { apply: string; label: string } | null {
  if (typeof option !== "object" || option === null) {
    return null;
  }
  const { insertText, label } =
    option as Partial<WorkspaceCodeSectionCompletionOption>;
  if (typeof insertText !== "string" || typeof label !== "string") {
    return null;
  }
  if (insertText.trim() === "" || label.trim() === "") {
    return null;
  }
  return { apply: insertText, label };
}

function isWorkspaceCodeSectionCompletionResult(
  result: unknown,
): result is WorkspaceCodeSectionCompletionResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "from" in result &&
    "to" in result &&
    "options" in result &&
    Array.isArray(result.options)
  );
}

function isCompletionKey(
  event: KeyboardEvent,
  key: "Enter" | "Escape" | "Tab",
) {
  return event.key === key || event.code === key;
}

function hasModifier(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function runCompletionCommand(
  event: KeyboardEvent,
  view: EditorView,
  command: (view: EditorView) => boolean,
) {
  event.preventDefault();
  event.stopPropagation();
  return command(view);
}

function handleSectionCompletionKeydown(
  event: KeyboardEvent,
  {
    completionEnabled,
    view,
  }: {
    completionEnabled: boolean;
    view: EditorView;
  },
): boolean | null {
  if (!completionEnabled || completionStatus(view.state) !== "active") {
    return null;
  }
  if (isCompletionKey(event, "Escape")) {
    return runCompletionCommand(event, view, closeCompletion);
  }
  if (
    !event.isComposing &&
    !view.composing &&
    !hasModifier(event) &&
    (isCompletionKey(event, "Enter") || isCompletionKey(event, "Tab"))
  ) {
    return runCompletionCommand(event, view, acceptCompletion);
  }
  return false;
}

export function getSectionEditorBasicSetup({
  lineNumbers,
  presentation,
}: {
  lineNumbers: boolean;
  presentation: WorkspaceSectionEditorPresentation;
}) {
  const isEditable = isSectionEditorEditable(presentation);

  const isGeneratedReader =
    presentation.mode === "generated-document" && !presentation.outerEditable;
  return {
    autocompletion: false,

    drawSelection: isEditable && presentation.mode !== "generated-document",

    foldGutter: lineNumbers,
    highlightActiveLine: !isGeneratedReader,
    highlightActiveLineGutter: !isGeneratedReader,
    lineNumbers,
  } as const;
}
