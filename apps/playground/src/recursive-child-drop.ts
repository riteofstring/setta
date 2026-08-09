import type { WorkspaceDocument, WorkspaceSection } from "@setta/workspace/core";
import type { WorkspaceExternalDropRequest } from "@setta/workspace/react";

export type RecursiveChildDropResult = Readonly<{
  document: WorkspaceDocument | null;
  status: string;
}>;

function validInsertionIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= length;
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
  if (parent.childLayout.positioning === "freeform") {
    return {
      document: null,
      status: "Recursive child drop canceled because freeform placement needs local geometry.",
    };
  }
  const insertionIndex = request.candidate.insertionIndex;
  if (!validInsertionIndex(insertionIndex, parent.childLayout.sectionIds.length)) {
    return {
      document: null,
      status: "Recursive child drop canceled because its insertion point changed.",
    };
  }
  const nextNumber =
    Object.keys(document.sections).filter((sectionId) => sectionId.startsWith("external-child-"))
      .length + 1;
  const sectionId = `external-child-${String(nextNumber)}`;
  const title =
    request.dataTransfer.getData(mimeType).trim() || `Dropped child ${String(nextNumber)}`;
  const sectionIds = [...parent.childLayout.sectionIds];
  sectionIds.splice(insertionIndex, 0, sectionId);
  return {
    document: {
      ...document,
      sections: {
        ...document.sections,
        [parentSectionId]: {
          ...parent,
          childLayout: { ...parent.childLayout, sectionIds },
        },
        [sectionId]: createSection(sectionId, title),
      },
    },
    status: `${title} added to ${parent.title}.`,
  };
}
