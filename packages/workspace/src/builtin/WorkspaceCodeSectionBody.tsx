import { useCallback } from "react";
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
  type WorkspaceCodeSectionMode,
} from "./codeSectionData";
import type { WorkspaceSectionEditorPresentation } from "./sectionEditorExtensions";
import { WorkspaceSectionEditor } from "./WorkspaceSectionEditor";

// The built-in Code Editor section body: the shared section-scale editor over the code section's
// authored language, wrapping, gutter, indentation, and mode options.

// Locking a section locks its content too, so a locked code section reads and scrolls but cannot
// be edited. It never turns an ordinary editor into generated output, and it has nothing to add
// to a section that is already non-editable.
function resolveEditorPresentation(
  mode: WorkspaceCodeSectionMode,
  positionAndSizeLocked: boolean,
): WorkspaceSectionEditorPresentation {
  return mode === "editable" && positionAndSizeLocked ? "read-only" : mode;
}

// The reader's own name for the surface. Both non-editable presentations say so, because the
// paint alone cannot tell a screen reader that this section refuses authoring.
function resolveEditorAriaLabel(
  sectionName: string,
  presentation: WorkspaceSectionEditorPresentation,
): string {
  if (presentation === "generated-output") {
    return `${sectionName} generated code, read-only`;
  }
  if (presentation === "read-only") {
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
  const presentation = resolveEditorPresentation(
    data.mode,
    section.positionAndSizeLocked,
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
