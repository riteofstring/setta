import { useCallback } from "react";
import { getSectionOrThrow } from "../document/documentSelectors";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import {
  getWorkspaceCodeSectionData,
  setWorkspaceCodeSectionData,
} from "./codeSectionActions";
import {
  getWorkspaceCodeSectionEditorLanguage,
  parseWorkspaceCodeSectionData,
  type WorkspaceCodeSectionLanguage,
} from "./codeSectionData";
import { WorkspaceSectionEditor } from "./WorkspaceSectionEditor";

// The built-in Code Editor section body: the shared section-scale editor over the code section's
// authored language, wrapping, gutter, and indentation options.

type WorkspaceCodeSectionBodyProps = {
  section: WorkspaceSection;
  allowedLanguages: ReadonlyArray<WorkspaceCodeSectionLanguage>;
};

export function WorkspaceCodeSectionBody({
  section,
  allowedLanguages,
}: WorkspaceCodeSectionBodyProps) {
  const sectionId = section.id;
  const data = parseWorkspaceCodeSectionData(
    sectionId,
    section.data,
    allowedLanguages,
  );
  // Locking a section locks its content too, so a locked code section reads and scrolls but
  // cannot be edited.
  const isReadOnly = data.readOnly || section.positionAndSizeLocked;

  const onChange = useCallback(
    (nextCode: string) => {
      const liveSection = getSectionOrThrow(
        useWorkspaceDocument.getState(),
        sectionId,
      );
      const liveData = getWorkspaceCodeSectionData(sectionId);
      if (
        liveData.readOnly ||
        liveSection.positionAndSizeLocked ||
        liveData.code === nextCode
      ) {
        return;
      }
      setWorkspaceCodeSectionData(sectionId, { ...liveData, code: nextCode });
    },
    [sectionId],
  );

  return (
    <WorkspaceSectionEditor
      ariaLabel={`${section.name} code editor`}
      indentWidth={data.indentWidth}
      isReadOnly={isReadOnly}
      language={getWorkspaceCodeSectionEditorLanguage(data.language)}
      lineNumbers={data.lineNumbers}
      onChange={onChange}
      sectionId={sectionId}
      value={data.code}
      wrapLines={data.wrapLines}
    />
  );
}
