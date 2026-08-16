import { getSectionOrThrow } from "../document/documentSelectors";
import { setSectionData } from "../document/sectionData";
import { getRegisteredSectionKindOrThrow } from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import {
  parseWorkspaceTextSectionData,
  WORKSPACE_TEXT_SECTION_KIND,
  type WorkspaceTextSectionData,
} from "./textSectionData";

// The typed read and write seam for the built-in text section's document data. The editor, the
// header display-mode control, and any host UI over the same section go through these, so there
// is one validated mutation path and one document change notification per edit.

function getTextSection(sectionId: string): WorkspaceSection {
  const section = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
  if (section.kind !== WORKSPACE_TEXT_SECTION_KIND) {
    throw new Error(
      `Section ${sectionId} is a ${section.kind} section, not a text section.`,
    );
  }
  return section;
}

export function getWorkspaceTextSectionData(
  sectionId: string,
): WorkspaceTextSectionData {
  const section = getTextSection(sectionId);
  return parseWorkspaceTextSectionData(sectionId, section.data);
}

export function setWorkspaceTextSectionData(
  sectionId: string,
  data: WorkspaceTextSectionData,
): void {
  const section = getTextSection(sectionId);
  const nextData = parseWorkspaceTextSectionData(sectionId, data);
  // The registration owns which formats and display modes it accepts; ask it before the write
  // rather than duplicating its narrowing here.
  getRegisteredSectionKindOrThrow(section.kind).assertValidData?.({
    ...section,
    data: nextData,
  });
  setSectionData(sectionId, nextData);
}
