import CodeMirror, { type ViewUpdate } from "@uiw/react-codemirror";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
} from "react";
import { useCodeMirrorTooltipParent } from "../canvas/codeMirrorTooltipParent";
import type { WorkspaceEditorLanguage } from "../controls/text/textValueLanguages";
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

// The section-scale editor both built-in content sections mount: the reference's `CoreCodeArea`
// and the wrapper its `MarkdownEditorInSection` reuses, behind the package's controlled-document
// seam. The editor owns text selection, its editing keys, and its own scroller; the surrounding
// section keeps header drag, resize, and every canvas gesture that begins outside it. The
// reference's focusable wrapper stays: Enter moves focus from the section into the editor, and
// Escape hands it back, which is the keyboard's way out of an editor that owns Tab. A
// non-editable presentation keeps that wrapper as its focus and scroll target while the editor
// itself stops being an editing surface at all.
//
// Every keystroke commits straight into the document, so the `value` this renders with is always
// the doc the editor already holds. That is what preserves the cursor, the selection, the undo
// history, the scroll offset, and editor focus: `@uiw/react-codemirror` only replaces its document
// when the incoming value differs from it, which an unrelated workspace change never makes true.

const WRAPPER_BASE_CLASS_NAME = `${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} min-h-0 flex-1 cursor-auto [&_*]:!outline-0`;

// The reference's rounded wrapper and its focused read-mode highlight, kept by every
// presentation: the reference paints its generated Python area with exactly this wrapper, and the
// fill answers the wrapper's own focus rather than a pointer landing in the editor.
const WRAPPER_PRESENTATION_CLASS_NAME = `rounded-lg focus:bg-blue-200/70 focus:outline-none dark:focus:bg-blue-950/70 [&_.cm-activeLineGutter]:focus:!bg-transparent [&_.cm-activeLine]:focus:!bg-transparent [&_.cm-gutters]:focus:!bg-transparent`;

// The generated block's own vocabulary — region, rail, badge, refused cursor, and selection paint
// — belongs to the package's scoped stylesheet.
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
  // Reads the live section rather than this render's data, so its identity never changes and
  // CodeMirror is never reconfigured mid-keystroke.
  onChange: (change: WorkspaceSectionEditorChange) => void;
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
}: WorkspaceSectionEditorProps) {
  const isEditable = isSectionEditorEditable(presentation);
  const isGeneratedDocument = presentation.mode === "generated-document";
  const theme = useTextValueTheme();
  // The canvas owns one sibling tooltip parent, keeping a popup outside this section's clipped
  // shell while it continues to pan and scale with the workspace.
  const tooltipParent = useCodeMirrorTooltipParent();
  // A Code section without a provider must retain the exact extension set it had before this
  // capability existed. The canvas may publish its tooltip parent after the editor mounts, but
  // that must not reconfigure an editor that has no completion surface.
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
    // The reference defers the focus move by a frame: taking it synchronously scrolls the canvas
    // when the editor is larger than the viewport.
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
  // One accepted edit reports the text and the range it moved together, so the section writes a
  // document whose region already matches the text beside it.
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
    // A non-editable section has no editing surface to enter, so Enter stays with the wrapper
    // rather than moving focus into an element that would refuse every keystroke.
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
    // The wrapper is the reference's own keyboard target: focusing it is how Escape leaves the
    // editor, and Enter is how the keyboard gets back in. A non-editable section keeps the same
    // focus and scroll target without advertising keys that no longer do anything.
    <article
      aria-keyshortcuts={isEditable ? "Enter Escape" : undefined}
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
