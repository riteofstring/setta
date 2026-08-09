import type { WorkspaceClipboardPlacedSections } from "./workspace-clipboard.js";
import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type WorkspaceChildLayout,
  type WorkspaceDocument,
  type WorkspacePoint,
} from "./workspace-document-contract.js";
import { validateWorkspaceDocument } from "./workspace-document-validation.js";
import type { WorkspaceActionRejectionReason } from "./workspace-surface-contract.js";

export type WorkspaceClipboardPasteApplication<TSectionData> =
  | Readonly<{ document: WorkspaceDocument<TSectionData>; status: "applied" }>
  | Readonly<{ reason: WorkspaceActionRejectionReason; status: "rejected" }>;

function isolatedPasteDocument<TSectionData>(
  paste: WorkspaceClipboardPlacedSections<TSectionData>,
): WorkspaceDocument<TSectionData> {
  return {
    rootSections: paste.rootSectionIds.map((sectionId) => ({
      position: { x: 0, y: 0 },
      sectionId,
    })),
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: paste.sections,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function freeformPositionsValid(
  sectionIds: readonly string[],
  parentId: string | null,
  positions: Readonly<Record<string, WorkspacePoint>>,
): boolean {
  const expected = new Set(sectionIds);
  const keys = Object.keys(positions);
  return (
    keys.length === expected.size &&
    keys.every((sectionId) => expected.has(sectionId)) &&
    sectionIds.every((sectionId) => {
      const position = positions[sectionId];
      return Boolean(
        position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        (parentId === null || (position.x >= 0 && position.y >= 0)),
      );
    })
  );
}

function applyRootPaste<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  paste: WorkspaceClipboardPlacedSections<TSectionData>,
): WorkspaceClipboardPasteApplication<TSectionData> {
  const placement = paste.destination.placement;
  if (
    placement.type !== "freeform" ||
    !freeformPositionsValid(paste.rootSectionIds, null, placement.positions)
  ) {
    return { reason: "section-layout-unsupported", status: "rejected" };
  }
  const nextDocument = {
    ...document,
    rootSections: [
      ...document.rootSections,
      ...paste.rootSectionIds.map((sectionId) => ({
        position: placement.positions[sectionId] as WorkspacePoint,
        sectionId,
      })),
    ],
    sections: { ...document.sections, ...paste.sections },
  };
  validateWorkspaceDocument(nextDocument);
  return { document: nextDocument, status: "applied" };
}

function applyNestedPaste<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  paste: WorkspaceClipboardPlacedSections<TSectionData>,
  parentId: string,
): WorkspaceClipboardPasteApplication<TSectionData> {
  const parent = document.sections[parentId];
  const childLayout = parent?.childLayout;
  if (!parent || !childLayout) {
    return { reason: "section-not-container", status: "rejected" };
  }
  const rejection = nestedPasteRejection(childLayout, paste);
  if (rejection) {
    return { reason: rejection, status: "rejected" };
  }
  const nextLayout = nestedPastedLayout(childLayout, paste);
  const nextDocument = {
    ...document,
    sections: {
      ...document.sections,
      ...paste.sections,
      [parentId]: { ...parent, childLayout: nextLayout },
    },
  };
  validateWorkspaceDocument(nextDocument);
  return { document: nextDocument, status: "applied" };
}

function nestedPasteRejection<TSectionData>(
  childLayout: WorkspaceChildLayout,
  paste: WorkspaceClipboardPlacedSections<TSectionData>,
): WorkspaceActionRejectionReason | null {
  const placement = paste.destination.placement;
  if (childLayout.positioning !== placement.type) {
    return "section-layout-unsupported";
  }
  if (placement.type === "ordered") {
    const validIndex =
      Number.isInteger(placement.index) &&
      placement.index >= 0 &&
      placement.index <= childLayout.sectionIds.length;
    return validIndex ? null : "section-move-invalid";
  }
  return freeformPositionsValid(
    paste.rootSectionIds,
    paste.destination.parentId,
    placement.positions,
  )
    ? null
    : "section-move-invalid";
}

function nestedPastedLayout<TSectionData>(
  childLayout: WorkspaceChildLayout,
  paste: WorkspaceClipboardPlacedSections<TSectionData>,
): WorkspaceChildLayout {
  const placement = paste.destination.placement;
  if (placement.type === "ordered" && childLayout.positioning === "ordered") {
    return {
      ...childLayout,
      sectionIds: [
        ...childLayout.sectionIds.slice(0, placement.index),
        ...paste.rootSectionIds,
        ...childLayout.sectionIds.slice(placement.index),
      ],
    };
  }
  if (placement.type === "freeform" && childLayout.positioning === "freeform") {
    return {
      ...childLayout,
      positions: { ...childLayout.positions, ...placement.positions },
      sectionIds: [...childLayout.sectionIds, ...paste.rootSectionIds],
    };
  }
  throw new Error("Workspace clipboard placement must match its destination layout.");
}

export function applyWorkspaceClipboardPaste<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  paste: WorkspaceClipboardPlacedSections<TSectionData>,
): WorkspaceClipboardPasteApplication<TSectionData> {
  validateWorkspaceDocument(isolatedPasteDocument(paste));
  if (
    Object.keys(paste.sections).some((sectionId) => Object.hasOwn(document.sections, sectionId))
  ) {
    return { reason: "section-id-exists", status: "rejected" };
  }
  return paste.destination.parentId === null
    ? applyRootPaste(document, paste)
    : applyNestedPaste(document, paste, paste.destination.parentId);
}
