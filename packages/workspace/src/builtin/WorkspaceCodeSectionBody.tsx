import { useCallback, useMemo } from "react";
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
  type WorkspaceCodeSectionLanguage,
  type WorkspaceGeneratedRegion,
} from "./codeSectionData";
import {
  EDITABLE_SECTION_EDITOR_PRESENTATION,
  READ_ONLY_SECTION_EDITOR_PRESENTATION,
  type WorkspaceSectionEditorPresentation,
} from "./sectionEditorExtensions";
import { WorkspaceSectionEditor } from "./WorkspaceSectionEditor";

// The built-in Code Editor section body: the shared section-scale editor over the code section's
// authored language, wrapping, gutter, indentation, and mode options.

// Only a generated document carries a region, so the parsed pair is the mode. Locking a section
// locks its content too, so a locked code section reads and scrolls but cannot be edited; it never
// turns an ordinary editor into a generated document, and it has nothing to add to a section that
// is already non-editable.
function resolveEditorPresentation(
  generatedRegion: WorkspaceGeneratedRegion | null,
  isReadOnly: boolean,
): WorkspaceSectionEditorPresentation {
  if (generatedRegion !== null) {
    return { mode: "generated-document", region: generatedRegion };
  }
  return isReadOnly
    ? READ_ONLY_SECTION_EDITOR_PRESENTATION
    : EDITABLE_SECTION_EDITOR_PRESENTATION;
}

// The reader's own name for the surface. Both non-editable presentations say so, because the
// paint alone cannot tell a screen reader that this section refuses authoring.
function resolveEditorAriaLabel(
  sectionName: string,
  presentation: WorkspaceSectionEditorPresentation,
): string {
  if (presentation.mode === "generated-document") {
    return `${sectionName} generated code, read-only`;
  }
  if (presentation.mode === "read-only") {
    return `${sectionName} code, read-only`;
  }
  return `${sectionName} code editor`;
}

type WorkspaceCodeSectionBodyProps = {
  section: WorkspaceSection;
  allowedLanguages: ReadonlyArray<WorkspaceCodeSectionLanguage>;
};

export function WorkspaceCodeSectionBody({
  section,
  allowedLanguages,
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
  const isReadOnly = data.mode === "read-only" || section.positionAndSizeLocked;
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
        isReadOnly,
      ),
    [isReadOnly, regionFrom, regionTo],
  );

  const onChange = useCallback(
    (nextCode: string) => {
      const liveSection = getSectionOrThrow(
        getWorkspaceDocumentStore(host).getState(),
        sectionId,
      );
      const liveData = getWorkspaceCodeSectionData(host, sectionId);
      if (
        liveData.mode !== "editable" ||
        liveSection.positionAndSizeLocked ||
        liveData.code === nextCode
      ) {
        return;
      }
      setWorkspaceCodeSectionData(host, sectionId, {
        ...liveData,
        code: nextCode,
      });
    },
    [host, sectionId],
  );

  return (
    <WorkspaceSectionEditor
      ariaLabel={resolveEditorAriaLabel(section.name, presentation)}
      indentWidth={data.indentWidth}
      language={getWorkspaceCodeSectionEditorLanguage(data.language)}
      lineNumbers={data.lineNumbers}
      onChange={onChange}
      presentation={presentation}
      sectionId={sectionId}
      value={data.code}
      wrapLines={data.wrapLines}
    />
  );
}
