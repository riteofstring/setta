import type {
  CanvasEngineCamera,
  CanvasEngineNestedPreviewRect,
} from "canvas-engine/types";

type NestedPreviewColor = [number, number, number];

type CollectNestedPreviewRectsParams = {
  hostElement: HTMLDivElement | null;
  camera: CanvasEngineCamera;
  knownTopLevelSectionIds: string[];
  previousRectsByParentSectionId: Map<string, CanvasEngineNestedPreviewRect[]>;
  activeSectionIds: string[];
};

type CollectNestedPreviewRectsResult = {
  nestedPreviewRects: CanvasEngineNestedPreviewRect[];
  rectsByParentSectionId: Map<string, CanvasEngineNestedPreviewRect[]>;
};

const DEFAULT_NESTED_PREVIEW_COLOR: NestedPreviewColor = [0.15, 0.18, 0.22];
const ACTIVE_NESTED_PREVIEW_COLOR: NestedPreviewColor = [0.28, 0.34, 0.44];
const NESTED_PREVIEW_EPSILON = 0.01;

export function collectCanvasEngineNestedPreviewRects({
  hostElement,
  camera,
  knownTopLevelSectionIds,
  previousRectsByParentSectionId,
  activeSectionIds,
}: CollectNestedPreviewRectsParams): CollectNestedPreviewRectsResult {
  const nextRectsByParentSectionId = new Map<
    string,
    CanvasEngineNestedPreviewRect[]
  >();
  const activeSectionIdSet = new Set(activeSectionIds);

  for (const sectionId of knownTopLevelSectionIds) {
    const previousRects = previousRectsByParentSectionId.get(sectionId);
    if (previousRects) {
      nextRectsByParentSectionId.set(sectionId, previousRects);
    }
  }

  if (hostElement) {
    const hostBounds = hostElement.getBoundingClientRect();
    const domIslandBySectionId = new Map<string, HTMLElement>();
    for (const domIsland of hostElement.querySelectorAll<HTMLElement>(
      "[data-canvas-engine-dom-island]",
    )) {
      const sectionId = domIsland.dataset.canvasEngineDomIsland;
      if (
        !sectionId ||
        domIsland.dataset.canvasEngineDomIslandRetained === "true"
      ) {
        continue;
      }
      domIslandBySectionId.set(sectionId, domIsland);
    }

    for (const parentSectionId of knownTopLevelSectionIds) {
      const domIsland = domIslandBySectionId.get(parentSectionId);
      if (!domIsland) {
        continue;
      }
      nextRectsByParentSectionId.set(
        parentSectionId,
        measureNestedPreviewRects({
          domIsland,
          hostBounds,
          camera,
          parentSectionId,
          activeSectionIdSet,
        }),
      );
    }
  }

  return {
    nestedPreviewRects: flattenNestedPreviewRects(
      knownTopLevelSectionIds,
      nextRectsByParentSectionId,
    ),
    rectsByParentSectionId: nextRectsByParentSectionId,
  };
}

export function areNestedPreviewRectArraysEqual(
  left: CanvasEngineNestedPreviewRect[],
  right: CanvasEngineNestedPreviewRect[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!areNestedPreviewRectsEqual(left[index], right[index])) {
      return false;
    }
  }
  return true;
}

function flattenNestedPreviewRects(
  knownTopLevelSectionIds: string[],
  rectsByParentSectionId: Map<string, CanvasEngineNestedPreviewRect[]>,
): CanvasEngineNestedPreviewRect[] {
  const flattenedRects: CanvasEngineNestedPreviewRect[] = [];
  for (const sectionId of knownTopLevelSectionIds) {
    const nestedRects = rectsByParentSectionId.get(sectionId);
    if (!nestedRects || nestedRects.length === 0) {
      continue;
    }
    flattenedRects.push(...nestedRects);
  }
  return flattenedRects;
}

function measureNestedPreviewRects({
  domIsland,
  hostBounds,
  camera,
  parentSectionId,
  activeSectionIdSet,
}: {
  domIsland: HTMLElement;
  hostBounds: DOMRect;
  camera: CanvasEngineCamera;
  parentSectionId: string;
  activeSectionIdSet: Set<string>;
}): CanvasEngineNestedPreviewRect[] {
  const nestedPreviewRects: CanvasEngineNestedPreviewRect[] = [];
  const seenSectionIds = new Set<string>();

  for (const sectionElement of domIsland.querySelectorAll<HTMLElement>(
    "section[data-section-id]",
  )) {
    const sectionId = sectionElement.dataset.sectionId;
    if (
      !sectionId ||
      sectionId === parentSectionId ||
      seenSectionIds.has(sectionId)
    ) {
      continue;
    }
    const sectionBounds = sectionElement.getBoundingClientRect();
    if (sectionBounds.width <= 0 || sectionBounds.height <= 0) {
      continue;
    }
    seenSectionIds.add(sectionId);
    const isActive =
      activeSectionIdSet.has(sectionId) ||
      sectionElement.dataset.sectionActive === "true";
    nestedPreviewRects.push({
      id: sectionId,
      parentSectionId,
      x: camera.x + (sectionBounds.left - hostBounds.left) / camera.zoom,
      y: camera.y + (sectionBounds.top - hostBounds.top) / camera.zoom,
      width: sectionBounds.width / camera.zoom,
      height: sectionBounds.height / camera.zoom,
      isActive,
      color: isActive
        ? ACTIVE_NESTED_PREVIEW_COLOR
        : DEFAULT_NESTED_PREVIEW_COLOR,
    });
  }

  return nestedPreviewRects;
}

function areNestedPreviewRectsEqual(
  left: CanvasEngineNestedPreviewRect,
  right: CanvasEngineNestedPreviewRect,
): boolean {
  return (
    left.id === right.id &&
    left.parentSectionId === right.parentSectionId &&
    Math.abs(left.x - right.x) <= NESTED_PREVIEW_EPSILON &&
    Math.abs(left.y - right.y) <= NESTED_PREVIEW_EPSILON &&
    Math.abs(left.width - right.width) <= NESTED_PREVIEW_EPSILON &&
    Math.abs(left.height - right.height) <= NESTED_PREVIEW_EPSILON &&
    left.isActive === right.isActive &&
    left.color[0] === right.color[0] &&
    left.color[1] === right.color[1] &&
    left.color[2] === right.color[2]
  );
}
