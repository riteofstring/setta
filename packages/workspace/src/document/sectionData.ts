import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionOrThrow } from "./documentSelectors";
import { getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceSectionData } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

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
  notifyWorkspaceDocumentChange(host);
}
