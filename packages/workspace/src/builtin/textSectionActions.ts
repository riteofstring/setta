import { getSectionOrThrow } from "../document/documentSelectors";
import { setSectionData } from "../document/sectionData";
import { getRegisteredSectionKindOrThrow } from "../document/sectionKindRegistry";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import {
  parseWorkspaceTextSectionData,
  WORKSPACE_TEXT_SECTION_KIND,
  type WorkspaceTextSectionData,
} from "./textSectionData";

function getTextSection(
  host: WorkspaceHost,
  sectionId: string,
): WorkspaceSection {
  const section = getSectionOrThrow(
    getWorkspaceDocumentStore(host).getState(),
    sectionId,
  );
  if (section.kind !== WORKSPACE_TEXT_SECTION_KIND) {
    throw new Error(
      `Section ${sectionId} is a ${section.kind} section, not a text section.`,
    );
  }
  return section;
}

export function getWorkspaceTextSectionData(
  host: WorkspaceHost,
  sectionId: string,
): WorkspaceTextSectionData {
  const section = getTextSection(host, sectionId);
  return parseWorkspaceTextSectionData(sectionId, section.data);
}

export function setWorkspaceTextSectionData(
  host: WorkspaceHost,
  sectionId: string,
  data: WorkspaceTextSectionData,
): void {
  const section = getTextSection(host, sectionId);
  const nextData = parseWorkspaceTextSectionData(sectionId, data);

  getRegisteredSectionKindOrThrow(host, section.kind).assertValidData?.({
    ...section,
    data: nextData,
  });
  setSectionData(host, sectionId, nextData);
}
