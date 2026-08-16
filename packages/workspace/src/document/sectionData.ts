import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionOrThrow } from "./documentSelectors";
import { getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceSectionData } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

// Registered section renderers commit host-owned opaque data through one canonical replacement and
// one notification. Typed item presentations use their separate item mutation funnels.
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
