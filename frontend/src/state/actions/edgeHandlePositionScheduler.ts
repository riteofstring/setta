import { updateEdgeHandlePositionsForSections } from "./edgeHandlePositionState";

let pendingHandleUpdateFrame: number | null = null;
const pendingHandleSectionIds = new Set<string>();

export function scheduleEdgeHandlePositionUpdate(sectionIds: string[]) {
  if (sectionIds.length === 0) {
    return;
  }
  for (const sectionId of sectionIds) {
    pendingHandleSectionIds.add(sectionId);
  }
  if (pendingHandleUpdateFrame !== null) {
    return;
  }
  pendingHandleUpdateFrame = requestAnimationFrame(() => {
    pendingHandleUpdateFrame = null;
    if (pendingHandleSectionIds.size === 0) {
      return;
    }
    const nextIds = Array.from(pendingHandleSectionIds);
    pendingHandleSectionIds.clear();
    updateEdgeHandlePositionsForSections(nextIds);
  });
}
