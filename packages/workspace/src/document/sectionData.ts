import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionOrThrow } from "./documentSelectors";
import { useWorkspaceDocument } from "./stores";
import type { WorkspaceSectionData } from "./types";

// Registered section renderers commit host-owned opaque data through one canonical replacement and
// one notification. Typed item presentations use their separate item mutation funnels.
export function setSectionData(
  sectionId: string,
  data: WorkspaceSectionData,
): void {
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
