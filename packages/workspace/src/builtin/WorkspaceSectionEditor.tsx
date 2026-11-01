import CodeMirror, { type ViewUpdate } from "@uiw/react-codemirror";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
} from "react";
import { useCodeMirrorTooltipParent } from "../canvas/codeMirrorTooltipParent";
import type { WorkspaceEditorLanguage } from "../controls/text/editorLanguages";
import { useTextValueTheme } from "../controls/text/textValueTheme";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../interaction";
import {
  getSectionEditorBasicSetup,
  getSectionEditorExtensions,
  isSectionEditorEditable,
  type WorkspaceSectionEditorChange,
  type WorkspaceSectionEditorPresentation,
} from "./sectionEditorExtensions";
import type { WorkspaceCodeSectionDiagnostic } from "./codeSectionData";
import type { WorkspaceCodeSectionCompletionProvider } from "./codeSectionCompletion";
import type { WorkspaceCodeSectionLanguage } from "./codeSectionData";
import { useSectionEditorHeight } from "./useSectionEditorHeight";

const WRAPPER_BASE_CLASS_NAME = `${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} min-h-0 flex-1 cursor-auto [&_*]:!outline-0`;

const WRAPPER_PRESENTATION_CLASS_NAME = `rounded-lg focus:bg-blue-200/70 focus:outline-none dark:focus:bg-blue-950/70 [&_.cm-activeLineGutter]:focus:!bg-transparent [&_.cm-activeLine]:focus:!bg-transparent`;

const GENERATED_DOCUMENT_CLASS_NAME = "setta-workspace-generated-document";

type WorkspaceSectionEditorProps = {
  ariaLabel: string;
  sectionId: string;
  value: string;
  language: WorkspaceEditorLanguage | null;
  completionLanguage?: WorkspaceCodeSectionLanguage;
  completionProvider?: WorkspaceCodeSectionCompletionProvider;
  wrapLines: boolean;
  lineNumbers: boolean;
  indentWidth: number;
  diagnostics: ReadonlyArray<WorkspaceCodeSectionDiagnostic>;
  presentation: WorkspaceSectionEditorPresentation;

  onChange: (change: WorkspaceSectionEditorChange) => void;
  onSubmit?: (change: WorkspaceSectionEditorChange) => void;
};

export function WorkspaceSectionEditor({
  ariaLabel,
  sectionId,
  value,
  language,
  completionLanguage,
  completionProvider,
  wrapLines,
  lineNumbers,
  indentWidth,
  diagnostics,
  presentation,
  onChange,
  onSubmit,
}: WorkspaceSectionEditorProps) {
  const isEditable = isSectionEditorEditable(presentation);
  const isGeneratedDocument = presentation.mode === "generated-document";
  const theme = useTextValueTheme();

  const tooltipParent = useCodeMirrorTooltipParent();

  const completionTooltipParent =
    completionProvider === undefined ? null : tooltipParent;
  const completionRequestRef = useRef<AbortController | null>(null);
  const completionRequests = useRef({
    abort() {
      completionRequestRef.current?.abort();
      completionRequestRef.current = null;
    },
    clear(controller: AbortController) {
      if (completionRequestRef.current === controller) {
        completionRequestRef.current = null;
      }
    },
    start() {
      completionRequestRef.current?.abort();
      const controller = new AbortController();
      completionRequestRef.current = controller;
      return controller;
    },
  }).current;
  const {
    editorHeight,
    wrapperRef,
    handleCreateEditor,
    handleEditorUpdate,
    maxHeight,
    overflowClassName,
    wheelClassName,
  } = useSectionEditorHeight(sectionId);

  const onEscape = useCallback(() => {
    requestAnimationFrame(() => {
      wrapperRef.current?.focus({ preventScroll: true });
    });
  }, [wrapperRef]);

  useLayoutEffect(() => {
    completionRequests.abort();
    return () => {
      completionRequests.abort();
    };
  }, [
    completionLanguage,
    completionProvider,
    completionRequests,
    isEditable,
    presentation,
    sectionId,
  ]);

  const { extensions, readGeneratedRegion } = useMemo(
    () =>
      getSectionEditorExtensions({
        language,
        wrapLines,
        indentWidth,
        diagnostics,
        presentation,
        onEscape,
        onSubmit,
        completionLanguage: completionLanguage ?? "plaintext",
        completionProvider,
        completionRequests,
        sectionId,
        tooltipParent: completionTooltipParent,
      }),
    [
      completionLanguage,
      completionProvider,
      completionRequests,
      diagnostics,
      indentWidth,
      language,
      onEscape,
      onSubmit,
      presentation,
      sectionId,
      completionTooltipParent,
      wrapLines,
    ],
  );
  const basicSetup = useMemo(
    () => getSectionEditorBasicSetup({ lineNumbers, presentation }),
    [lineNumbers, presentation],
  );

  const handleChange = useCallback(
    (nextValue: string, update: ViewUpdate) => {
      onChange({
        generatedRegion: readGeneratedRegion(update.state),
        text: nextValue,
      });
    },
    [onChange, readGeneratedRegion],
  );

  function onWrapperKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      !isEditable ||
      event.target !== event.currentTarget ||
      event.key !== "Enter"
    ) {
      return;
    }
    const contentElement =
      event.currentTarget.querySelector("[contenteditable]");
    if (contentElement instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      contentElement.focus({ preventScroll: true });
    }
  }

  return (
    <article
      aria-keyshortcuts={
        isEditable
          ? onSubmit === undefined
            ? "Enter Escape"
            : "Enter Escape Control+Enter Meta+Enter"
          : undefined
      }
      aria-label={ariaLabel}
      className={`${WRAPPER_BASE_CLASS_NAME} ${WRAPPER_PRESENTATION_CLASS_NAME}${isGeneratedDocument ? ` ${GENERATED_DOCUMENT_CLASS_NAME}` : ""} ${overflowClassName} ${wheelClassName}`}
      data-workspace-section-editor={presentation.mode}
      onKeyDown={onWrapperKeyDown}
      ref={wrapperRef}
      tabIndex={0}
    >
      <CodeMirror
        basicSetup={basicSetup}
        className={editorHeight === undefined ? undefined : "h-full"}
        extensions={extensions}
        height={editorHeight}
        indentWithTab
        maxHeight={maxHeight}
        onChange={handleChange}
        onCreateEditor={handleCreateEditor}
        onUpdate={handleEditorUpdate}
        theme={theme}
        value={value}
      />
    </article>
  );
}
