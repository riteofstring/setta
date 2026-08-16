import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getWorkspaceDocumentStore } from "../document/stores";
import { normalizeSectionTagColor } from "./sectionTagColors";
import type { WorkspaceHost } from "../workspaceHost";

// Frozen main treats tag color as a layout mutation and refuses it for a frozen section. One public
// package action owns the same capability/lock checks, canonical color write, no-op behavior, and
// single host notification for both the Inspector and direct host invocations.
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
  notifyWorkspaceDocumentChange(host);
}
