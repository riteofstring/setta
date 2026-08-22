import { useCallback, useMemo, useRef } from "react";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  getWorkspaceCodeSectionData,
  setWorkspaceCodeSectionData,
} from "./codeSectionActions";
import {
  getWorkspaceCodeSectionEditorLanguage,
  parseWorkspaceCodeSectionData,
  type WorkspaceCodeSectionData,
  type WorkspaceCodeSectionLanguage,
  type WorkspaceGeneratedRegion,
} from "./codeSectionData";
import type { WorkspaceCodeSectionCompletionProvider } from "./codeSectionCompletion";
import {
  EDITABLE_SECTION_EDITOR_PRESENTATION,
  READ_ONLY_SECTION_EDITOR_PRESENTATION,
  type WorkspaceSectionEditorChange,
  type WorkspaceSectionEditorPresentation,
} from "./sectionEditorExtensions";
import { WorkspaceSectionEditor } from "./WorkspaceSectionEditor";

// The built-in Code Editor section body: the shared section-scale editor over the code section's
// authored language, wrapping, gutter, indentation, and mode options.

// Only a generated document carries a region, so the parsed pair is the mode. Locking a section
// locks its content too, so a locked code section reads and scrolls but cannot be edited; it never
// turns an ordinary editor into a generated document, and a locked generated document keeps the
// block's paint while accepting nothing at all.
function resolveEditorPresentation(
  generatedRegion: WorkspaceGeneratedRegion | null,
  isReadOnlyMode: boolean,
  isLocked: boolean,
): WorkspaceSectionEditorPresentation {
  if (generatedRegion !== null) {
    return {
      mode: "generated-document",
      outerEditable: !isLocked,
      region: generatedRegion,
    };
  }
  return isReadOnlyMode || isLocked
    ? READ_ONLY_SECTION_EDITOR_PRESENTATION
    : EDITABLE_SECTION_EDITOR_PRESENTATION;
}

// The reader's own name for the surface, because the paint alone cannot tell a screen reader what
// this section accepts: a generated document is an editor whose generated output refuses edits,
// and the two non-editable presentations say they refuse everything.
function resolveEditorAriaLabel(
  sectionName: string,
  presentation: WorkspaceSectionEditorPresentation,
): string {
  if (presentation.mode === "generated-document") {
    return presentation.outerEditable
      ? `${sectionName} code editor, generated output read-only`
      : `${sectionName} generated code, read-only`;
  }
  if (presentation.mode === "read-only") {
    return `${sectionName} code, read-only`;
  }
  return `${sectionName} code editor`;
}

// The next document data for one accepted edit, or null when the section has nothing to write.
// A generated document persists the mapped range with the text, so its own data never describes a
// region that has moved out from under it.
function nextCodeSectionData(
  liveData: WorkspaceCodeSectionData,
  change: WorkspaceSectionEditorChange,
): WorkspaceCodeSectionData | null {
  if (liveData.mode === "editable") {
    return liveData.code === change.text
      ? null
      : { ...liveData, code: change.text, diagnostics: [] };
  }
  if (
    liveData.mode !== "generated-document" ||
    change.generatedRegion === null
  ) {
    return null;
  }
  const region = change.generatedRegion;
  const held = liveData.generatedRegion;
  if (
    liveData.code === change.text &&
    held.from === region.from &&
    held.to === region.to
  ) {
    return null;
  }
  return {
    ...liveData,
    code: change.text,
    diagnostics: [],
    generatedRegion: region,
  };
}

type WorkspaceCodeSectionBodyProps = {
  section: WorkspaceSection;
  allowedLanguages: ReadonlyArray<WorkspaceCodeSectionLanguage>;
  completionProvider?: WorkspaceCodeSectionCompletionProvider;
};

export function WorkspaceCodeSectionBody({
  section,
  allowedLanguages,
  completionProvider,
}: WorkspaceCodeSectionBodyProps) {
  const host = useWorkspaceHost();
  const sectionId = section.id;
  const data = parseWorkspaceCodeSectionData(
    sectionId,
    section.data,
    allowedLanguages,
  );
  // The data is parsed fresh on every render, so the presentation is rebuilt only when the values
  // it carries move. That is what keeps the editor from reconfiguring itself between keystrokes.
  const isReadOnlyMode = data.mode === "read-only";
  const isLocked = section.positionAndSizeLocked;
  const regionFrom =
    data.mode === "generated-document" ? data.generatedRegion.from : null;
  const regionTo =
    data.mode === "generated-document" ? data.generatedRegion.to : null;
  const presentation = useMemo(
    () =>
      resolveEditorPresentation(
        regionFrom === null || regionTo === null
          ? null
          : { from: regionFrom, to: regionTo },
        isReadOnlyMode,
        isLocked,
      ),
    [isLocked, isReadOnlyMode, regionFrom, regionTo],
  );
  // Parsing correctly produces fresh records. Keep an unchanged diagnostic set referentially
  // stable so an unrelated document publication never reconfigures CodeMirror mid-keystroke.
  const diagnosticsSignature = JSON.stringify(data.diagnostics);
  const diagnosticsRef = useRef({
    signature: diagnosticsSignature,
    value: data.diagnostics,
  });
  if (diagnosticsRef.current.signature !== diagnosticsSignature) {
    diagnosticsRef.current = {
      signature: diagnosticsSignature,
      value: data.diagnostics,
    };
  }
  const diagnostics = diagnosticsRef.current.value;

  const onChange = useCallback(
    (change: WorkspaceSectionEditorChange) => {
      const liveSection = getSectionOrThrow(
        getWorkspaceDocumentStore(host).getState(),
        sectionId,
      );
      if (liveSection.positionAndSizeLocked) {
        return;
      }
      const liveData = getWorkspaceCodeSectionData(host, sectionId);
      const nextData = nextCodeSectionData(liveData, change);
      if (nextData !== null) {
        setWorkspaceCodeSectionData(host, sectionId, nextData);
      }
    },
    [host, sectionId],
  );

  return (
    <WorkspaceSectionEditor
      ariaLabel={resolveEditorAriaLabel(section.name, presentation)}
      completionLanguage={data.language}
      completionProvider={completionProvider}
      indentWidth={data.indentWidth}
      language={getWorkspaceCodeSectionEditorLanguage(data.language)}
      lineNumbers={data.lineNumbers}
      diagnostics={diagnostics}
      onChange={onChange}
      presentation={presentation}
      sectionId={sectionId}
      value={data.code}
      wrapLines={data.wrapLines}
    />
  );
}
