import { resolveOverCollisionId } from "forks/dnd-kit/adapter/collisionCompare";

import { useDndState } from "forks/dnd-kit/dndState";

import { addTemporaryNotification } from "state/actions/notifications";

import {
  getSectionChildren,
  getSectionIsHorizontalOrientation,
  getSectionType,
} from "state/actions/sectionInfos";

import {
  getRootSelectedSectionIds,
  getSharedParentId,
  orderSectionIdsByParent,
} from "state/actions/sections/sectionSelection";

import { getActiveSectionUIIds } from "state/activeSectionUI";

import {
  useProjectState,
  useSectionRefs,
  useShareSession,
} from "state/definitions";

import { SectionTypeEnum } from "utils/generatedTypes";

import type { DragOverEvent, DragStartEvent } from "./adapter";

import { lastPastHalfwayByOverId } from "./dropTypeResolution";

export function hasInvalidCodeParentConstraints(
  state: ReturnType<typeof useProjectState.getState>,
  newParentId: string,
  activeId: string,
  selectedIds: string[],
) {
  if (getSectionType(state, String(activeId)) !== SectionTypeEnum.Terminal) {
    return true;
  }
  if (selectedIds.length !== 1) {
    return true;
  }

  const children = getSectionChildren(state, newParentId);
  return (
    children.length > 1 ||
    (children.length === 1 && !selectedIds.includes(children[0]))
  );
}

export function getOverId(
  over: { id: string | number } | null,
  collisions: DragOverEvent["collisions"] | null,
) {
  const fallbackId = over ? over.id : null;
  return resolveOverCollisionId(collisions, fallbackId);
}

export function getOverCollisionPastHalfway(
  overId: string | number | null,
  collisions: DragOverEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  if (overId) {
    const matching = collisions.find((collision) => collision.id === overId);
    if (matching && matching.pastHalfway !== undefined) {
      return Boolean(matching.pastHalfway);
    }

    const overIdKey = String(overId);
    const hasLastPastHalfway = Object.prototype.hasOwnProperty.call(
      lastPastHalfwayByOverId,
      overIdKey,
    );
    if (hasLastPastHalfway) {
      return lastPastHalfwayByOverId[overIdKey];
    }
    return null;
  }

  const overCollision = collisions[0];
  if (!overCollision || overCollision.pastHalfway === undefined) {
    return null;
  }

  return Boolean(overCollision.pastHalfway);
}

export function getSectionIsGlobalVariables(sectionId: string) {
  return (
    useProjectState.getState().singletonSections.GlobalVariables === sectionId
  );
}

export type DragRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type PlaceholderSize = {
  width: number;
  height: number;
};

export type PlaceholderSizeInput = {
  draggingIds: string[];
  rectsById: Record<string, DragRect> | null;
  zoom: number;
};

export type SectionOrientation = "horizontal" | "vertical";

export function resolveSectionPlaceholderSize({
  draggingIds,
  rectsById,
  zoom,
}: PlaceholderSizeInput): PlaceholderSize | null {
  if (draggingIds.length === 0 || !rectsById) {
    return null;
  }

  const state = useProjectState.getState();
  const { indexById, orientation } = resolvePlaceholderLayout(
    state,
    draggingIds,
  );
  const size = accumulateSectionSizes({
    draggingIds,
    rectsById,
    orientation,
    indexById,
  });

  return scalePlaceholderSize(size, zoom);
}

export function resolvePlaceholderLayout(
  state: ReturnType<typeof useProjectState.getState>,
  draggingIds: string[],
) {
  const parentId = resolvePlaceholderParentId(state, draggingIds);
  const children = parentId ? getSectionChildren(state, parentId) : null;
  return {
    indexById: children ? buildChildIndexMap(children) : null,
    orientation: resolveParentOrientation(parentId),
  };
}

export function resolvePlaceholderParentId(
  state: ReturnType<typeof useProjectState.getState>,
  draggingIds: string[],
) {
  return (
    getSharedParentId(state, draggingIds) ??
    state.parentSectionMap[draggingIds[0]] ??
    null
  );
}

export function buildChildIndexMap(children: string[]) {
  return new Map(children.map((childId, index) => [childId, index]));
}

export function scalePlaceholderSize(
  size: PlaceholderSize,
  zoom: number,
): PlaceholderSize | null {
  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    width: size.width / safeZoom,
    height: size.height / safeZoom,
  };
}

export function resolveParentOrientation(
  parentId: string | null,
): SectionOrientation {
  if (!parentId) {
    return "vertical";
  }
  if (getSectionIsHorizontalOrientation(parentId)) {
    return "horizontal";
  }
  return "vertical";
}

export function collectSectionRects({
  activeId,
  activeRect,
  draggingIds,
}: {
  activeId: string;
  activeRect: DragStartEvent["activeRect"] | null;
  draggingIds: string[];
}): Record<string, DragRect> | null {
  const refs = useSectionRefs.getState();
  const rectsById: Record<string, DragRect> = {};

  for (const sectionId of draggingIds) {
    const ref = refs.selfOnly[sectionId] ?? refs.withNested[sectionId];
    if (ref) {
      const rect = ref.getBoundingClientRect();
      rectsById[sectionId] = {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
      continue;
    }

    if (sectionId === activeId && activeRect) {
      rectsById[sectionId] = { ...activeRect };
    }
  }

  if (Object.keys(rectsById).length === 0) {
    return null;
  }
  return rectsById;
}

export function accumulateSectionSizes({
  draggingIds,
  rectsById,
  orientation,
  indexById,
}: {
  draggingIds: string[];
  rectsById: Record<string, DragRect>;
  orientation: SectionOrientation;
  indexById: Map<string, number> | null;
}): PlaceholderSize {
  let width = 0;
  let height = 0;

  for (const sectionId of draggingIds) {
    const rect = rectsById[sectionId];
    if (!rect) {
      continue;
    }
    if (orientation === "horizontal") {
      width += rect.width;
      height = Math.max(height, rect.height);
    } else {
      width = Math.max(width, rect.width);
      height += rect.height;
    }
  }

  if (indexById) {
    const gapTotal = resolveAdjacentGapTotal({
      draggingIds,
      rectsById,
      orientation,
      indexById,
    });
    if (orientation === "horizontal") {
      width += gapTotal;
    } else {
      height += gapTotal;
    }
  }

  return { width, height };
}

export function resolveAdjacentGapTotal({
  draggingIds,
  rectsById,
  orientation,
  indexById,
}: {
  draggingIds: string[];
  rectsById: Record<string, DragRect>;
  orientation: SectionOrientation;
  indexById: Map<string, number>;
}): number {
  let gapTotal = 0;

  for (let i = 0; i < draggingIds.length - 1; i += 1) {
    const currentId = draggingIds[i];
    const nextId = draggingIds[i + 1];
    const currentIndex = indexById.get(currentId);
    const nextIndex = indexById.get(nextId);
    if (
      currentIndex === undefined ||
      nextIndex === undefined ||
      nextIndex !== currentIndex + 1
    ) {
      continue;
    }

    const currentRect = rectsById[currentId];
    const nextRect = rectsById[nextId];
    if (!currentRect || !nextRect) {
      continue;
    }

    const gap =
      orientation === "horizontal"
        ? nextRect.left - (currentRect.left + currentRect.width)
        : nextRect.top - (currentRect.top + currentRect.height);
    if (gap > 0) {
      gapTotal += gap;
    }
  }

  return gapTotal;
}

export function resolveSectionDragSelection(
  activeId: string,
  activeRect: DragStartEvent["activeRect"] | null,
): {
  draggingIds: string[];
  rectsById: Record<string, DragRect> | null;
  draggingRectsById: Record<string, DragRect> | null;
} {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return buildSectionSelection([activeId], activeId, activeRect);
  }

  const state = useProjectState.getState();
  const activeIds = getActiveSectionUIIds();
  if (!activeIds.includes(activeId)) {
    return buildSectionSelection([activeId], activeId, activeRect);
  }

  const { rootIds } = getRootSelectedSectionIds(state, activeIds);
  if (rootIds.length === 0) {
    return buildSectionSelection([activeId], activeId, activeRect);
  }

  const sharedParentId = getSharedParentId(state, rootIds);
  if (rootIds.length > 1 && sharedParentId === undefined) {
    addTemporaryNotification("Section selection spans multiple parents.");
    return buildSectionSelection([activeId], activeId, activeRect);
  }

  const orderedIds = orderSectionIdsByParent(
    state,
    sharedParentId ?? null,
    rootIds,
  );
  return buildSectionSelection(orderedIds, activeId, activeRect);
}

export function buildSectionSelection(
  draggingIds: string[],
  activeId: string,
  activeRect: DragStartEvent["activeRect"] | null,
): {
  draggingIds: string[];
  rectsById: Record<string, DragRect> | null;
  draggingRectsById: Record<string, DragRect> | null;
} {
  const rectsById = collectSectionRects({
    activeId,
    activeRect,
    draggingIds,
  });
  return {
    draggingIds,
    rectsById,
    draggingRectsById: resolveDraggingRectsForSelection(rectsById),
  };
}

export function resolveDraggingRectsForSelection(
  rectsById: Record<string, DragRect> | null,
): Record<string, DragRect> | null {
  const dndState = useDndState.getState();
  if (!dndState.isMovingFree || !rectsById) {
    return null;
  }
  return rectsById;
}
