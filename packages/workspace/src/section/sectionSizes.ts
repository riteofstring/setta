import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../document/documentSelectors";
import { assertValidSectionOverflowMode } from "../document/groupOverflow";
import { getSectionKindSizeConstraints } from "../document/sectionKindRegistry";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores";
import type { SectionSize, WorkspaceSection } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import {
  clampWorkspaceSectionSize,
  getWorkspaceSectionSizeBounds,
} from "./resize/sectionSizingBounds";

export type ResizeHandleDirection =
  | "bottom"
  | "bottomLeft"
  | "bottomRight"
  | "left"
  | "right"
  | "top"
  | "topLeft"
  | "topRight";

const RESIZE_WIDTH_DIRECTIONS = new Set<ResizeHandleDirection>([
  "right",
  "bottomRight",
  "topRight",
]);
const RESIZE_HEIGHT_DIRECTIONS = new Set<ResizeHandleDirection>([
  "bottom",
  "bottomRight",
  "bottomLeft",
]);

export function isHeightResizeDirection(
  direction: ResizeHandleDirection,
): boolean {
  return RESIZE_HEIGHT_DIRECTIONS.has(direction);
}

export function getResizeStartAutoSizeUpdate({
  size,
  direction,
  rect,
}: {
  size: SectionSize;
  direction: ResizeHandleDirection;
  rect: { width: number; height: number };
}): Partial<SectionSize> | null {
  const nextSize: Partial<SectionSize> = {};
  if (size.width === "auto" && RESIZE_WIDTH_DIRECTIONS.has(direction)) {
    nextSize.width = Math.round(rect.width);
  }
  if (size.height === "auto" && RESIZE_HEIGHT_DIRECTIONS.has(direction)) {
    nextSize.height = Math.round(rect.height);
  }
  return Object.keys(nextSize).length > 0 ? nextSize : null;
}

type SectionSizeUpdateResult = {
  sections: Record<string, WorkspaceSection>;
  updatedSectionSizes: Record<string, SectionSize>;
};

function setSectionSize(
  sections: Record<string, WorkspaceSection>,
  sectionId: string,
  size: Partial<SectionSize>,
  updatedSectionSizes: Record<string, SectionSize>,
): Record<string, WorkspaceSection> {
  const section = sections[sectionId];
  if (!section) {
    throw new Error(`Unknown section ${sectionId} in a size update.`);
  }
  const newSize: SectionSize = { ...section.size, ...size };
  updatedSectionSizes[sectionId] = newSize;
  return { ...sections, [sectionId]: { ...section, size: newSize } };
}

function getSectionDescendants(
  state: WorkspaceDocumentState,
  sectionId: string,
): Array<string> {
  const ids = [sectionId];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    if (currId !== undefined) {
      ids.push(...getSectionOrThrow(state, currId).children);
    }
    idx += 1;
  }
  return ids;
}

function getHighestVerticalGroupAncestor(
  state: WorkspaceDocumentState,
  sectionId: string,
): string {
  const parentIdGetter = (id: string) => {
    const section = getSectionOrThrow(state, id);
    const parentId = state.parentSectionMap[id] ?? null;
    if (
      parentId &&
      isGroupSection(section) &&
      !section.isHorizontalOrientation
    ) {
      return parentId;
    }
    return null;
  };
  let highestAncestor = sectionId;
  let parentId = parentIdGetter(sectionId);
  while (parentId) {
    highestAncestor = parentId;
    parentId = parentIdGetter(parentId);
  }
  return highestAncestor;
}

export function setSelfParentSiblingChildrenWidths(
  state: WorkspaceDocumentState,
  sectionId: string,
  changedSize: Partial<SectionSize>,
): SectionSizeUpdateResult {
  const updatedSectionSizes: Record<string, SectionSize> = {};
  let sections = setSectionSize(
    state.sections,
    sectionId,
    changedSize,
    updatedSectionSizes,
  );
  if (changedSize.width !== undefined) {
    const highestAncestor = getHighestVerticalGroupAncestor(state, sectionId);
    for (const descendantId of getSectionDescendants(state, highestAncestor)) {
      if (descendantId === sectionId) {
        continue;
      }
      sections = setSectionSize(
        sections,
        descendantId,
        { width: changedSize.width },
        updatedSectionSizes,
      );
    }
  }
  return { sections, updatedSectionSizes };
}

function clampRegisteredSectionSizes(
  host: WorkspaceHost,
  sections: Record<string, WorkspaceSection>,
  updatedSectionSizes: Record<string, SectionSize>,
): SectionSizeUpdateResult {
  let resolvedSections = sections;
  let resolvedSectionSizes = updatedSectionSizes;
  for (const sectionId of Object.keys(updatedSectionSizes)) {
    const section = resolvedSections[sectionId];
    if (!section) {
      throw new Error(`Size update lost section ${sectionId}.`);
    }
    const constraints = getSectionKindSizeConstraints(host, section);
    if (!constraints) {
      continue;
    }
    const size = clampWorkspaceSectionSize(
      section.size,
      getWorkspaceSectionSizeBounds(constraints),
    );
    if (
      size.width === section.size.width &&
      size.height === section.size.height
    ) {
      continue;
    }
    resolvedSections = {
      ...resolvedSections,
      [sectionId]: { ...section, size },
    };
    resolvedSectionSizes = { ...resolvedSectionSizes, [sectionId]: size };
  }
  return {
    sections: resolvedSections,
    updatedSectionSizes: resolvedSectionSizes,
  };
}

export function persistSectionSizeChange(
  host: WorkspaceHost,
  sectionId: string,
  nextSize: Partial<SectionSize>,
  historyChangeKind: "section-resize" | null = "section-resize",
) {
  const documentStore = getWorkspaceDocumentStore(host);
  const state = documentStore.getState();
  const resized = setSelfParentSiblingChildrenWidths(
    state,
    sectionId,
    nextSize,
  );
  const { sections, updatedSectionSizes } = clampRegisteredSectionSizes(
    host,
    resized.sections,
    resized.updatedSectionSizes,
  );
  for (const updatedSectionId of Object.keys(updatedSectionSizes)) {
    const section = sections[updatedSectionId];
    if (!section) {
      throw new Error(`Size update lost section ${updatedSectionId}.`);
    }
    assertValidSectionOverflowMode(updatedSectionId, section);
  }
  documentStore.setState({ sections });
  notifyWorkspaceDocumentChange(host, historyChangeKind);
}

export function setWorkspaceSectionSize(
  host: WorkspaceHost,
  sectionId: string,
  nextSize: Partial<SectionSize>,
): void {
  persistSectionSizeChange(host, sectionId, nextSize);
}
