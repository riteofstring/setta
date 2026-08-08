import {
  WORKSPACE_DOCUMENT_VERSION,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "./core.js";

export function createWorkspaceTestDocument(
  sections: readonly WorkspaceSection[],
): WorkspaceDocument {
  return {
    version: WORKSPACE_DOCUMENT_VERSION,
    rootSectionIds: sections.map((section) => section.id),
    sections: Object.fromEntries(sections.map((section) => [section.id, section])),
  };
}
