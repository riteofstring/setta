import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionOrThrow } from "./documentSelectors";
import { useWorkspaceDocument } from "./stores";
import type { WorkspaceSectionData } from "./types";

// The section-data counterpart to setItemData: registered content renderers commit validated
// host-owned configuration/value data through one canonical replacement and one notification.
// The package deliberately does not merge or interpret the opaque payload.
export function setSectionData(sectionId: string, data: WorkspaceSectionData): void {
  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  useWorkspaceDocument.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: { ...section, data },
    },
  });
  notifyWorkspaceDocumentChange();
}
