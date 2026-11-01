import { getWorkspaceCapabilitiesStore } from "../document/capabilities.js";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback.js";
import { getSectionOrThrow } from "../document/documentSelectors.js";
import { getWorkspaceDocumentStore } from "../document/stores.js";
import { normalizeSectionTagColor } from "./sectionTagColors.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export function setSectionTagColor(
  host: WorkspaceHost,
  sectionId: string,
  tagColor: string | null,
): void {
  const canonical = normalizeSectionTagColor(tagColor);
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditLayout) {
    throw new Error(
      "Changing a section tag color requires permission to edit workspace layout.",
    );
  }
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  if (section.positionAndSizeLocked) {
    throw new Error(
      `Section ${sectionId} is locked and cannot change its tag color.`,
    );
  }
  if (section.tagColor === canonical) {
    return;
  }
  documentStore.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: { ...section, tagColor: canonical },
    },
  });
  notifyWorkspaceDocumentChange(host, "section-presentation");
}
