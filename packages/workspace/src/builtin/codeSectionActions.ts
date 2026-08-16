import { getSectionOrThrow } from "../document/documentSelectors";
import { setSectionData } from "../document/sectionData";
import { getRegisteredSectionKindOrThrow } from "../document/sectionKindRegistry";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import {
  parseWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_KIND,
  type WorkspaceCodeSectionData,
} from "./codeSectionData";

// The typed read and write seam for the built-in code section's document data. The editor and any
// host UI over the same section go through these, so there is one validated mutation path and one
// document change notification per edit.

function getCodeSection(host: WorkspaceHost, sectionId: string): WorkspaceSection {
  const section = getSectionOrThrow(
    getWorkspaceDocumentStore(host).getState(),
    sectionId,
  );
  if (section.kind !== WORKSPACE_CODE_SECTION_KIND) {
    throw new Error(
      `Section ${sectionId} is a ${section.kind} section, not a code section.`,
    );
  }
  return section;
}

export function getWorkspaceCodeSectionData(
  host: WorkspaceHost,
  sectionId: string,
): WorkspaceCodeSectionData {
  const section = getCodeSection(host, sectionId);
  return parseWorkspaceCodeSectionData(sectionId, section.data);
}

export function setWorkspaceCodeSectionData(
  host: WorkspaceHost,
  sectionId: string,
  data: WorkspaceCodeSectionData,
): void {
  const section = getCodeSection(host, sectionId);
  const nextData = parseWorkspaceCodeSectionData(sectionId, data);
  // The registration owns which languages it accepts; ask it before the write rather than
  // duplicating its narrowing here.
  getRegisteredSectionKindOrThrow(host, section.kind).assertValidData?.({
    ...section,
    data: nextData,
  });
  setSectionData(host, sectionId, nextData);
}
