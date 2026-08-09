import type { WorkspaceDocument, WorkspaceSection } from "@setta/workspace/core";
import type { WorkspaceExternalDropRequest } from "@setta/workspace/react";

export type RecursiveChildDropResult = Readonly<{
  document: WorkspaceDocument | null;
  status: string;
}>;

function validInsertionIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= length;
}

function validLocalPosition(position: Readonly<{ x: number; y: number }>): boolean {
  return (
    Number.isFinite(position.x) && Number.isFinite(position.y) && position.x >= 0 && position.y >= 0
  );
}

function placementRejection(
  layout: NonNullable<WorkspaceSection["childLayout"]>,
  placement: WorkspaceExternalDropRequest["candidate"]["placement"],
): string | null {
  if (layout.positioning !== placement.type) {
    return "Recursive child drop canceled because its container layout changed.";
  }
  if (placement.type === "ordered") {
    return validInsertionIndex(placement.index, layout.sectionIds.length)
      ? null
      : "Recursive child drop canceled because its insertion point changed.";
  }
  return validLocalPosition(placement.position)
    ? null
    : "Recursive child drop canceled because its local position is invalid.";
}

function layoutWithDroppedChild(
  layout: NonNullable<WorkspaceSection["childLayout"]>,
  placement: WorkspaceExternalDropRequest["candidate"]["placement"],
  sectionId: string,
): NonNullable<WorkspaceSection["childLayout"]> {
  if (layout.positioning === "ordered" && placement.type === "ordered") {
    const sectionIds = [...layout.sectionIds];
    sectionIds.splice(placement.index, 0, sectionId);
    return { ...layout, sectionIds };
  }
  if (layout.positioning === "freeform" && placement.type === "freeform") {
    return {
      ...layout,
      positions: { ...layout.positions, [sectionId]: placement.position },
      sectionIds: [...layout.sectionIds, sectionId],
    };
  }
  throw new Error("Recursive child drop placement must match its container layout.");
}

export function applyRecursiveChildDrop(
  document: WorkspaceDocument,
  request: WorkspaceExternalDropRequest,
  mimeType: string,
  createSection: (sectionId: string, title: string) => WorkspaceSection,
): RecursiveChildDropResult {
  const parentSectionId = request.candidate.parentSectionId;
  if (!parentSectionId) {
    return {
      document: null,
      status: "Recursive child drop canceled because its container is unavailable.",
    };
  }
  const parent = document.sections[parentSectionId];
  if (!parent?.childLayout) {
    return {
      document: null,
      status: "Recursive child drop canceled because its container is unavailable.",
    };
  }
  const placement = request.candidate.placement;
  const rejection = placementRejection(parent.childLayout, placement);
  if (rejection) {
    return { document: null, status: rejection };
  }
  const nextNumber =
    Object.keys(document.sections).filter((sectionId) => sectionId.startsWith("external-child-"))
      .length + 1;
  const sectionId = `external-child-${String(nextNumber)}`;
  const title =
    request.dataTransfer.getData(mimeType).trim() || `Dropped child ${String(nextNumber)}`;
  const childLayout = layoutWithDroppedChild(parent.childLayout, placement, sectionId);
  return {
    document: {
      ...document,
      sections: {
        ...document.sections,
        [parentSectionId]: {
          ...parent,
          childLayout,
        },
        [sectionId]: createSection(sectionId, title),
      },
    },
    status: `${title} added to ${parent.title}.`,
  };
}
