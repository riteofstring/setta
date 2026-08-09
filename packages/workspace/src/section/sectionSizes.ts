import { getSectionOrThrow, isGroupSection } from "../document/documentSelectors";
import { useWorkspaceDocument, type WorkspaceDocumentState } from "../document/stores";
import type { SectionSize, WorkspaceSection } from "../document/types";

// The reference's resize commit funnel (`state/actions/sections/sectionSizes.ts` +
// `persistSectionSizeChange` in CustomResizable), minus the embedded attached-terminal branch
// that left with terminals. Width propagation stops at the nearest horizontal-group boundary:
// the walk climbs while the current section is a vertical group, then writes the width onto
// every descendant of the highest such ancestor.

export type ResizeHandleDirection =
  "bottom" | "bottomLeft" | "bottomRight" | "left" | "right" | "top" | "topLeft" | "topRight";

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

export function isHeightResizeDirection(direction: ResizeHandleDirection): boolean {
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

function getSectionDescendants(state: WorkspaceDocumentState, sectionId: string): Array<string> {
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

// The reference climbs with a predicate parent getter: the walk continues only while the
// current section is a nested vertical (non-horizontal) group.
function getHighestVerticalGroupAncestor(state: WorkspaceDocumentState, sectionId: string): string {
  const parentIdGetter = (id: string) => {
    const section = getSectionOrThrow(state, id);
    const parentId = state.parentSectionMap[id] ?? null;
    if (parentId && isGroupSection(section) && !section.isHorizontalOrientation) {
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
  let sections = setSectionSize(state.sections, sectionId, changedSize, updatedSectionSizes);
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

// The single resize persistence funnel. The reference pairs the canonical write with a
// `setSectionSizes` backend route; the Phase 2 change-callback seam owns host notification.
export function persistSectionSizeChange(sectionId: string, nextSize: Partial<SectionSize>) {
  useWorkspaceDocument.setState((state) => {
    const { sections } = setSelfParentSiblingChildrenWidths(state, sectionId, nextSize);
    return { sections };
  });
}
