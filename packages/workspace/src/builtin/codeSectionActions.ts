import { getSectionOrThrow } from "../document/documentSelectors";
import { setSectionData } from "../document/sectionData";
import { getRegisteredSectionKindOrThrow } from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import {
  parseWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_KIND,
  type WorkspaceCodeSectionData,
} from "./codeSectionData";

// The typed read and write seam for the built-in code section's document data. The editor and any
// host UI over the same section go through these, so there is one validated mutation path and one
// document change notification per edit.

function getCodeSection(sectionId: string): WorkspaceSection {
  const section = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
  if (section.kind !== WORKSPACE_CODE_SECTION_KIND) {
    throw new Error(
      `Section ${sectionId} is a ${section.kind} section, not a code section.`,
    );
  }
  return section;
}

export function getWorkspaceCodeSectionData(
  sectionId: string,
): WorkspaceCodeSectionData {
  const section = getCodeSection(sectionId);
  return parseWorkspaceCodeSectionData(sectionId, section.data);
}

export function setWorkspaceCodeSectionData(
  sectionId: string,
  data: WorkspaceCodeSectionData,
): void {
  const section = getCodeSection(sectionId);
  const nextData = parseWorkspaceCodeSectionData(sectionId, data);
  // The registration owns which languages it accepts; ask it before the write rather than
  // duplicating its narrowing here.
  getRegisteredSectionKindOrThrow(section.kind).assertValidData?.({
    ...section,
    data: nextData,
  });
  setSectionData(sectionId, nextData);
}
