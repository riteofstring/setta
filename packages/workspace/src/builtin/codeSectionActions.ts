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

function getCodeSection(
  host: WorkspaceHost,
  sectionId: string,
): WorkspaceSection {
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

  getRegisteredSectionKindOrThrow(host, section.kind).assertValidData?.({
    ...section,
    data: nextData,
  });
  setSectionData(host, sectionId, nextData);
}
