import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useMemo, type KeyboardEvent } from "react";
import { useTextValueTheme } from "../controls/text/textValueTheme";
import { getSectionOrThrow } from "../document/documentSelectors";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../interaction";
import { getWorkspaceCodeSectionData, setWorkspaceCodeSectionData } from "./codeSectionActions";
import {
  parseWorkspaceCodeSectionData,
  type WorkspaceCodeSectionLanguage,
} from "./codeSectionData";
import { getCodeSectionBasicSetup, getCodeSectionExtensions } from "./codeSectionExtensions";
import { useCodeSectionEditorHeight } from "./useCodeSectionEditorHeight";

// The built-in Code Editor section body: the reference's `CoreCodeArea` behind the package's
// controlled-document seam. The editor owns text selection, its editing keys, and its own
// scroller; the surrounding section keeps header drag, resize, and every canvas gesture that
// begins outside it. The reference's focusable wrapper stays: Enter moves focus from the section
// into the editor, and Escape hands it back, which is the keyboard's way out of an editor that
// owns Tab.
//
// Every keystroke commits straight into the document, so the `value` this renders with is always
// the doc the editor already holds. That is what preserves the cursor, the selection, the undo
// history, the scroll offset, and editor focus: `@uiw/react-codemirror` only replaces its document
// when the incoming value differs from it, which an unrelated workspace change never makes true.

const WRAPPER_BASE_CLASS_NAME = `${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} min-h-0 flex-1 cursor-auto rounded-lg focus:bg-blue-200/70 focus:outline-none dark:focus:bg-blue-950/70 [&_*]:!outline-0 [&_.cm-activeLineGutter]:focus:!bg-transparent [&_.cm-activeLine]:focus:!bg-transparent [&_.cm-gutters]:focus:!bg-transparent`;

export type WorkspaceCodeSectionBodyProps = {
  section: WorkspaceSection;
  allowedLanguages: ReadonlyArray<WorkspaceCodeSectionLanguage>;
};

export function WorkspaceCodeSectionBody({
  section,
  allowedLanguages,
}: WorkspaceCodeSectionBodyProps) {
  const sectionId = section.id;
  const data = parseWorkspaceCodeSectionData(sectionId, section.data, allowedLanguages);
  // Locking a section locks its content too, so a locked code section reads and scrolls but
  // cannot be edited.
  const isReadOnly = data.readOnly || section.positionAndSizeLocked;
  const theme = useTextValueTheme();
  const { wrapperRef, handleCreateEditor, maxHeight, overflowClassName, wheelClassName } =
    useCodeSectionEditorHeight(sectionId);

  const onEscape = useCallback(() => {
    // The reference defers the focus move by a frame: taking it synchronously scrolls the canvas
    // when the editor is larger than the viewport.
    requestAnimationFrame(() => {
      wrapperRef.current?.focus({ preventScroll: true });
    });
  }, [wrapperRef]);

  // The commit reads the live section rather than closing over this render's data, so its
  // identity never changes and CodeMirror is never reconfigured mid-keystroke.
  const onChange = useCallback(
    (nextCode: string) => {
      const liveSection = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
      const liveData = getWorkspaceCodeSectionData(sectionId);
      if (liveData.readOnly || liveSection.positionAndSizeLocked || liveData.code === nextCode) {
        return;
      }
      setWorkspaceCodeSectionData(sectionId, { ...liveData, code: nextCode });
    },
    [sectionId],
  );

  const extensions = useMemo(
    () =>
      getCodeSectionExtensions({
        language: data.language,
        wrapLines: data.wrapLines,
        indentWidth: data.indentWidth,
        isReadOnly,
        onEscape,
      }),
    [data.indentWidth, data.language, data.wrapLines, isReadOnly, onEscape],
  );
  const basicSetup = useMemo(
    () => getCodeSectionBasicSetup({ lineNumbers: data.lineNumbers }),
    [data.lineNumbers],
  );

  function onWrapperKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || event.key !== "Enter") {
      return;
    }
    const contentElement = event.currentTarget.querySelector("[contenteditable]");
    if (contentElement instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      contentElement.focus({ preventScroll: true });
    }
  }

  return (
    // The wrapper is the reference's own keyboard target: focusing it is how Escape leaves the
    // editor, and Enter is how the keyboard gets back in.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <article
      aria-keyshortcuts="Enter Escape"
      aria-label={`${section.name} code editor`}
      className={`${WRAPPER_BASE_CLASS_NAME} ${overflowClassName} ${wheelClassName}`}
      onKeyDown={onWrapperKeyDown}
      ref={wrapperRef}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <CodeMirror
        basicSetup={basicSetup}
        extensions={extensions}
        indentWithTab
        maxHeight={maxHeight}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        theme={theme}
        value={data.code}
      />
    </article>
  );
}
