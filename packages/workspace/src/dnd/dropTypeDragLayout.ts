import { getReactFlowStore } from "../canvas/store";
import { getActiveSectionIds } from "../document/activeSections";
import {
  getSectionChildren,
  getSectionIsHorizontalOrientation,
} from "../document/documentSelectors";
import {
  getRootSelectedSectionIds,
  getSharedParentId,
  orderSectionIdsByParent,
} from "../document/sectionSelection";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores";
import { getSectionRefsStore } from "../section/sectionRefs";
import type { WorkspaceHost } from "../workspaceHost";
import type { DragStartEvent } from "./adapter";
import { getDndStateStore } from "./dndState";

type DragRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type PlaceholderSize = {
  width: number;
  height: number;
};

type PlaceholderSizeInput = {
  draggingIds: Array<string>;
  rectsById: Record<string, DragRect> | null;
  zoom: number;
};

type SectionOrientation = "horizontal" | "vertical";

type SectionDragSelection = {
  draggingIds: Array<string>;
  rectsById: Record<string, DragRect> | null;
  draggingRectsById: Record<string, DragRect> | null;
};

export function resolveDragStartLayout(
  host: WorkspaceHost,
  activeId: string,
  activeRect: DragStartEvent["activeRect"] | null,
) {
  const selection = resolveSectionDragSelection(host, activeId, activeRect);
  const safeZoom = resolveSafeZoom(host);
  const placeholderSize = resolveSectionPlaceholderSize(host, {
    draggingIds: selection.draggingIds,
    rectsById: selection.rectsById,
    zoom: safeZoom,
  });

  return {
    selection,
    normalizedWidth:
      placeholderSize?.width ?? (activeRect?.width ?? 0) / safeZoom,
    normalizedHeight:
      placeholderSize?.height ?? (activeRect?.height ?? 0) / safeZoom,
  };
}

function resolveSafeZoom(host: WorkspaceHost) {
  const zoom = getReactFlowStore(host).getState().transform[2];
  return zoom > 0 ? zoom : 1;
}

function resolveSectionPlaceholderSize(
  host: WorkspaceHost,
  { draggingIds, rectsById, zoom }: PlaceholderSizeInput,
): PlaceholderSize | null {
  if (draggingIds.length === 0 || !rectsById) {
    return null;
  }

  const state = getWorkspaceDocumentStore(host).getState();
  const { indexById, orientation } = resolvePlaceholderLayout(
    host,
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

function resolvePlaceholderLayout(
  host: WorkspaceHost,
  state: WorkspaceDocumentState,
  draggingIds: Array<string>,
) {
  const parentId = resolvePlaceholderParentId(state, draggingIds);
  const children = parentId ? getSectionChildren(state, parentId) : null;
  return {
    indexById: children ? buildChildIndexMap(children) : null,
    orientation: resolveParentOrientation(host, parentId),
  };
}

function resolvePlaceholderParentId(
  state: WorkspaceDocumentState,
  draggingIds: Array<string>,
) {
  const firstDraggingId = draggingIds[0];
  return (
    getSharedParentId(state, draggingIds) ??
    (firstDraggingId !== undefined
      ? (state.parentSectionMap[firstDraggingId] ?? null)
      : null)
  );
}

function buildChildIndexMap(children: Array<string>) {
  return new Map(children.map((childId, index) => [childId, index]));
}

function scalePlaceholderSize(
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

function resolveParentOrientation(
  host: WorkspaceHost,
  parentId: string | null,
): SectionOrientation {
  if (!parentId) {
    return "vertical";
  }
  if (getSectionIsHorizontalOrientation(host, parentId)) {
    return "horizontal";
  }
  return "vertical";
}

function collectSectionRects(
  host: WorkspaceHost,
  {
    activeId,
    activeRect,
    draggingIds,
  }: {
    activeId: string;
    activeRect: DragStartEvent["activeRect"] | null;
    draggingIds: Array<string>;
  },
): Record<string, DragRect> | null {
  const refs = getSectionRefsStore(host).getState();
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

function accumulateSectionSizes({
  draggingIds,
  rectsById,
  orientation,
  indexById,
}: {
  draggingIds: Array<string>;
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

function resolveAdjacentGapTotal({
  draggingIds,
  rectsById,
  orientation,
  indexById,
}: {
  draggingIds: Array<string>;
  rectsById: Record<string, DragRect>;
  orientation: SectionOrientation;
  indexById: Map<string, number>;
}): number {
  let gapTotal = 0;

  for (let i = 0; i < draggingIds.length - 1; i += 1) {
    const gap = resolveAdjacentGap({
      currentId: draggingIds[i],
      nextId: draggingIds[i + 1],
      rectsById,
      orientation,
      indexById,
    });
    if (gap > 0) {
      gapTotal += gap;
    }
  }

  return gapTotal;
}

function resolveAdjacentGap({
  currentId,
  nextId,
  rectsById,
  orientation,
  indexById,
}: {
  currentId: string | undefined;
  nextId: string | undefined;
  rectsById: Record<string, DragRect>;
  orientation: SectionOrientation;
  indexById: Map<string, number>;
}): number {
  if (currentId === undefined || nextId === undefined) {
    return 0;
  }
  const currentIndex = indexById.get(currentId);
  const nextIndex = indexById.get(nextId);
  if (
    currentIndex === undefined ||
    nextIndex === undefined ||
    nextIndex !== currentIndex + 1
  ) {
    return 0;
  }

  const currentRect = rectsById[currentId];
  const nextRect = rectsById[nextId];
  if (!currentRect || !nextRect) {
    return 0;
  }

  return orientation === "horizontal"
    ? nextRect.left - (currentRect.left + currentRect.width)
    : nextRect.top - (currentRect.top + currentRect.height);
}

function resolveSectionDragSelection(
  host: WorkspaceHost,
  activeId: string,
  activeRect: DragStartEvent["activeRect"] | null,
): SectionDragSelection {
  const state = getWorkspaceDocumentStore(host).getState();
  const activeIds = getActiveSectionIds(host);
  if (!activeIds.includes(activeId)) {
    return buildSectionSelection(host, [activeId], activeId, activeRect);
  }

  const { rootIds } = getRootSelectedSectionIds(state, activeIds);
  if (rootIds.length === 0) {
    return buildSectionSelection(host, [activeId], activeId, activeRect);
  }

  const sharedParentId = getSharedParentId(state, rootIds);
  if (rootIds.length > 1 && sharedParentId === undefined) {
    return buildSectionSelection(host, [activeId], activeId, activeRect);
  }

  const orderedIds = orderSectionIdsByParent(
    state,
    sharedParentId ?? null,
    rootIds,
  );
  return buildSectionSelection(host, orderedIds, activeId, activeRect);
}

function buildSectionSelection(
  host: WorkspaceHost,
  draggingIds: Array<string>,
  activeId: string,
  activeRect: DragStartEvent["activeRect"] | null,
): SectionDragSelection {
  const rectsById = collectSectionRects(host, {
    activeId,
    activeRect,
    draggingIds,
  });
  return {
    draggingIds,
    rectsById,
    draggingRectsById: resolveDraggingRectsForSelection(host, rectsById),
  };
}

function resolveDraggingRectsForSelection(
  host: WorkspaceHost,
  rectsById: Record<string, DragRect> | null,
): Record<string, DragRect> | null {
  const dndState = getDndStateStore(host).getState();
  if (!dndState.isMovingFree || !rectsById) {
    return null;
  }
  return rectsById;
}
