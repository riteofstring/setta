import type { WorkspaceClipboardPlacedSections } from "./workspace-clipboard.js";
import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type WorkspaceDocument,
} from "./workspace-document-contract.js";
import { validateWorkspaceDocument } from "./workspace-document-validation.js";

export type WorkspaceClipboardPasteApplication<TSectionData> =
  | Readonly<{ document: WorkspaceDocument<TSectionData>; status: "applied" }>
  | Readonly<{ reason: "section-id-exists"; status: "rejected" }>;

export function applyWorkspaceClipboardPaste<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  paste: WorkspaceClipboardPlacedSections<TSectionData>,
): WorkspaceClipboardPasteApplication<TSectionData> {
  const pastedDocument: WorkspaceDocument<TSectionData> = {
    rootSections: paste.rootSections,
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: paste.sections,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  validateWorkspaceDocument(pastedDocument);
  if (
    Object.keys(pastedDocument.sections).some((sectionId) =>
      Object.hasOwn(document.sections, sectionId),
    )
  ) {
    return { reason: "section-id-exists", status: "rejected" };
  }
  return {
    document: {
      ...document,
      rootSections: [...document.rootSections, ...pastedDocument.rootSections],
      sections: { ...document.sections, ...pastedDocument.sections },
    },
    status: "applied",
  };
}
