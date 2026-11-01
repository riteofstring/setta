import { notifyWorkspaceDocumentChange } from "./documentChangeCallback.js";
import { getSectionOrThrow } from "./documentSelectors.js";
import { getWorkspaceDocumentStore } from "./stores.js";
import type { WorkspaceSectionData } from "./types.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export function setSectionData(
  host: WorkspaceHost,
  sectionId: string,
  data: WorkspaceSectionData,
): void {
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  documentStore.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: { ...section, data },
    },
  });
  notifyWorkspaceDocumentChange(host, null);
}
