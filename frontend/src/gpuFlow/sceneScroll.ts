import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "./scene";
import { resolveGpuFlowSceneLayout } from "./sceneLayout";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuSectionSceneScrollOffsetMap = ReadonlyMap<string, GpuPoint>;

export type GpuSectionSceneDragAutoScrollResult = {
  readonly changed: boolean;
  readonly parentSectionId: string | null;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
};

export type GpuSectionSceneWheelScrollResult =
  GpuSectionSceneDragAutoScrollResult;

const DEFAULT_SCENE_DRAG_AUTO_SCROLL_MARGIN_PX = 48;
const DEFAULT_SCENE_DRAG_AUTO_SCROLL_MAX_SPEED_PX = 20;
const GPU_SECTION_SCENE_WHEEL_DELTA_LINE = 1;
const GPU_SECTION_SCENE_WHEEL_DELTA_PAGE = 2;
const GPU_SECTION_SCENE_WHEEL_LINE_DELTA_PX = 20;

export function applyGpuSectionSceneScrollOffsets(
  scene: GpuFlowScene,
  scrollOffsets: GpuSectionSceneScrollOffsetMap,
): GpuFlowScene {
  if (scrollOffsets.size === 0) {
    return scene;
  }
  return resolveGpuFlowSceneLayout({
    ...scene,
    sections: scene.sections.map((section) =>
      applyGpuSectionSceneNodeScrollOffset(section, scrollOffsets),
    ),
  });
}

export function resolveGpuSectionSceneDragAutoScroll({
  draggedRect,
  marginPx = DEFAULT_SCENE_DRAG_AUTO_SCROLL_MARGIN_PX,
  maxSpeedPx = DEFAULT_SCENE_DRAG_AUTO_SCROLL_MAX_SPEED_PX,
  parentSectionId,
  scene,
  scrollOffsets,
}: {
  readonly draggedRect: GpuRect;
  readonly marginPx?: number | undefined;
  readonly maxSpeedPx?: number | undefined;
  readonly parentSectionId: string | null;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
}): GpuSectionSceneDragAutoScrollResult {
  assertFiniteNonNegative("scene drag auto-scroll margin", marginPx);
  assertFiniteNonNegative("scene drag auto-scroll max speed", maxSpeedPx);
  const context = getGpuSectionSceneDragAutoScrollContext({
    parentSectionId,
    scene,
  });
  if (!context) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const delta = getGpuSectionSceneDragAutoScrollAxisDelta({
    axis: context.axis,
    draggedRect,
    marginPx,
    maxSpeedPx,
    viewportRect: context.viewportRect,
  });
  if (delta === 0) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const currentOffset =
    scrollOffsets.get(context.parent.sectionId) ?? context.parent.scrollOffset;
  const maxOffset = getGpuSectionSceneMaxScrollOffsetOnAxis({
    axis: context.axis,
    parent: context.parent,
    sectionById: context.sectionById,
  });
  const nextAxisOffset = clampNumber(
    getGpuPointValueOnAxis(currentOffset, context.axis) + delta,
    0,
    maxOffset,
  );
  if (nextAxisOffset === getGpuPointValueOnAxis(currentOffset, context.axis)) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const nextOffsets = new Map(scrollOffsets);
  nextOffsets.set(context.parent.sectionId, {
    ...currentOffset,
    [context.axis]: nextAxisOffset,
  });
  return {
    changed: true,
    parentSectionId: context.parent.sectionId,
    scrollOffsets: nextOffsets,
  };
}

export function resolveGpuSectionSceneWheelScroll({
  event,
  point,
  scene,
  scrollOffsets,
}: {
  readonly event: Pick<
    WheelEvent,
    "deltaMode" | "deltaX" | "deltaY" | "shiftKey"
  >;
  readonly point: GpuPoint;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
}): GpuSectionSceneWheelScrollResult {
  assertFiniteNumber("section scene wheel point x", point.x);
  assertFiniteNumber("section scene wheel point y", point.y);
  const context = getGpuSectionSceneWheelScrollContext({
    point,
    scene,
  });
  if (!context) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const delta = getGpuSectionSceneWheelScrollAxisDelta({
    axis: context.axis,
    event,
    viewportRect: context.viewportRect,
  });
  if (delta === 0) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const currentOffset =
    scrollOffsets.get(context.parent.sectionId) ?? context.parent.scrollOffset;
  const maxOffset = getGpuSectionSceneMaxScrollOffsetOnAxis({
    axis: context.axis,
    parent: context.parent,
    sectionById: context.sectionById,
  });
  const nextAxisOffset = clampNumber(
    getGpuPointValueOnAxis(currentOffset, context.axis) + delta,
    0,
    maxOffset,
  );
  if (nextAxisOffset === getGpuPointValueOnAxis(currentOffset, context.axis)) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const nextOffsets = new Map(scrollOffsets);
  nextOffsets.set(context.parent.sectionId, {
    ...currentOffset,
    [context.axis]: nextAxisOffset,
  });
  return {
    changed: true,
    parentSectionId: context.parent.sectionId,
    scrollOffsets: nextOffsets,
  };
}

function applyGpuSectionSceneNodeScrollOffset(
  section: GpuSectionSceneNode,
  scrollOffsets: GpuSectionSceneScrollOffsetMap,
): GpuSectionSceneNode {
  const scrollOffset = scrollOffsets.get(section.sectionId);
  if (!scrollOffset) {
    return section;
  }
  assertFiniteNumber(
    `section scene ${section.sectionId} scroll offset x`,
    scrollOffset.x,
  );
  assertFiniteNumber(
    `section scene ${section.sectionId} scroll offset y`,
    scrollOffset.y,
  );
  if (
    section.scrollOffset.x === scrollOffset.x &&
    section.scrollOffset.y === scrollOffset.y
  ) {
    return section;
  }
  return {
    ...section,
    dirty: section.dirty.includes("scroll")
      ? section.dirty
      : [...section.dirty, "scroll"],
    scrollOffset,
  };
}

function unchangedGpuSectionSceneDragAutoScroll(
  scrollOffsets: GpuSectionSceneScrollOffsetMap,
): GpuSectionSceneDragAutoScrollResult {
  return {
    changed: false,
    parentSectionId: null,
    scrollOffsets,
  };
}

function getGpuSectionSceneNodeById(
  scene: GpuFlowScene,
): ReadonlyMap<string, GpuSectionSceneNode> {
  return new Map(scene.sections.map((section) => [section.sectionId, section]));
}

function getGpuSectionSceneDragAutoScrollContext({
  parentSectionId,
  scene,
}: {
  readonly parentSectionId: string | null;
  readonly scene: GpuFlowScene;
}): {
  readonly axis: "x" | "y";
  readonly parent: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly viewportRect: GpuRect;
} | null {
  if (!parentSectionId) {
    return null;
  }
  const sectionById = getGpuSectionSceneNodeById(scene);
  const parent = sectionById.get(parentSectionId);
  if (!parent) {
    throw new Error(
      `Missing drag auto-scroll parent section scene node ${parentSectionId}.`,
    );
  }
  const axis = getGpuSectionSceneScrollAxis(parent.layoutMode);
  if (!axis) {
    return null;
  }
  const viewportRect = getGpuSectionSceneVisibleChildViewportRect(parent);
  if (getGpuRectSizeOnAxis(viewportRect, axis) <= 0) {
    return null;
  }
  return {
    axis,
    parent,
    sectionById,
    viewportRect,
  };
}

function getGpuSectionSceneWheelScrollContext({
  point,
  scene,
}: {
  readonly point: GpuPoint;
  readonly scene: GpuFlowScene;
}): {
  readonly axis: "x" | "y";
  readonly parent: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly viewportRect: GpuRect;
} | null {
  const sectionById = getGpuSectionSceneNodeById(scene);
  const candidates = scene.sections
    .map((section, index) => ({ index, section }))
    .filter(({ section }) =>
      isGpuSectionSceneWheelScrollCandidate({
        point,
        section,
        sectionById,
      }),
    )
    .map(({ index, section }) => ({
      axis: getGpuSectionSceneScrollAxis(section.layoutMode) as "x" | "y",
      depth: getGpuSectionSceneNodeDepth(section, sectionById),
      index,
      section,
      viewportRect: getGpuSectionSceneVisibleChildViewportRect(section),
    }))
    .sort(
      (left, right) =>
        right.depth - left.depth ||
        (right.section.zIndex ?? 0) - (left.section.zIndex ?? 0) ||
        right.index - left.index,
    );
  const winner = candidates[0];
  if (!winner) {
    return null;
  }
  return {
    axis: winner.axis,
    parent: winner.section,
    sectionById,
    viewportRect: winner.viewportRect,
  };
}

function isGpuSectionSceneWheelScrollCandidate({
  point,
  section,
  sectionById,
}: {
  readonly point: GpuPoint;
  readonly section: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
}): boolean {
  const axis = getGpuSectionSceneScrollAxis(section.layoutMode);
  if (!axis || section.childSectionIds.length === 0) {
    return false;
  }
  const viewportRect = getGpuSectionSceneVisibleChildViewportRect(section);
  return (
    getGpuRectSizeOnAxis(viewportRect, axis) > 0 &&
    getGpuSectionSceneMaxScrollOffsetOnAxis({
      axis,
      parent: section,
      sectionById,
    }) > 0 &&
    gpuRectContainsPoint(viewportRect, point)
  );
}

function getGpuSectionSceneScrollAxis(
  layoutMode: GpuSectionSceneLayoutMode,
): "x" | "y" | null {
  if (layoutMode === "horizontal" || layoutMode === "kanban") {
    return "x";
  }
  if (layoutMode === "vertical") {
    return "y";
  }
  return null;
}

function getGpuSectionSceneVisibleChildViewportRect(
  section: GpuSectionSceneNode,
): GpuRect {
  return intersectGpuRects(section.childViewportRect ?? section.bodyRect, {
    height: section.clipRect.height,
    width: section.clipRect.width,
    x: section.clipRect.x,
    y: section.clipRect.y,
  });
}

function getGpuSectionSceneDragAutoScrollAxisDelta({
  axis,
  draggedRect,
  marginPx,
  maxSpeedPx,
  viewportRect,
}: {
  readonly axis: "x" | "y";
  readonly draggedRect: GpuRect;
  readonly marginPx: number;
  readonly maxSpeedPx: number;
  readonly viewportRect: GpuRect;
}): number {
  const pointValue = getGpuRectCenterOnAxis(draggedRect, axis);
  const min = getGpuRectMinOnAxis(viewportRect, axis) + marginPx;
  const max = getGpuRectMaxOnAxis(viewportRect, axis) - marginPx;
  if (pointValue < min) {
    return -getGpuSectionSceneDragAutoScrollVelocity({
      maxSpeedPx,
      pointValue,
      threshold: min,
    });
  }
  if (pointValue > max) {
    return getGpuSectionSceneDragAutoScrollVelocity({
      maxSpeedPx,
      pointValue,
      threshold: max,
    });
  }
  return 0;
}

function getGpuSectionSceneDragAutoScrollVelocity({
  maxSpeedPx,
  pointValue,
  threshold,
}: {
  readonly maxSpeedPx: number;
  readonly pointValue: number;
  readonly threshold: number;
}): number {
  return (
    (clampNumber(Math.abs(pointValue - threshold), 1, 50) / 50) * maxSpeedPx
  );
}

function getGpuSectionSceneMaxScrollOffsetOnAxis({
  axis,
  parent,
  sectionById,
}: {
  readonly axis: "x" | "y";
  readonly parent: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
}): number {
  let contentEnd = 0;
  for (const childSectionId of parent.childSectionIds) {
    const child = sectionById.get(childSectionId);
    if (!child) {
      throw new Error(`Missing section scene child ${childSectionId}.`);
    }
    contentEnd = Math.max(
      contentEnd,
      getGpuRectMaxOnAxis(child.localRect, axis),
    );
  }
  const viewportRect = parent.childViewportRect ?? parent.bodyRect;
  return Math.max(contentEnd - getGpuRectSizeOnAxis(viewportRect, axis), 0);
}

function getGpuSectionSceneWheelScrollAxisDelta({
  axis,
  event,
  viewportRect,
}: {
  readonly axis: "x" | "y";
  readonly event: Pick<
    WheelEvent,
    "deltaMode" | "deltaX" | "deltaY" | "shiftKey"
  >;
  readonly viewportRect: GpuRect;
}): number {
  const { deltaX, deltaY } = getGpuSectionSceneWheelPixelDelta(
    event,
    viewportRect,
  );
  if (axis === "x") {
    return deltaX !== 0 ? deltaX : event.shiftKey ? deltaY : 0;
  }
  return deltaY;
}

function getGpuSectionSceneWheelPixelDelta(
  event: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">,
  viewportRect: GpuRect,
): { readonly deltaX: number; readonly deltaY: number } {
  if (event.deltaMode === GPU_SECTION_SCENE_WHEEL_DELTA_LINE) {
    return {
      deltaX: event.deltaX * GPU_SECTION_SCENE_WHEEL_LINE_DELTA_PX,
      deltaY: event.deltaY * GPU_SECTION_SCENE_WHEEL_LINE_DELTA_PX,
    };
  }
  if (event.deltaMode === GPU_SECTION_SCENE_WHEEL_DELTA_PAGE) {
    return {
      deltaX: event.deltaX * viewportRect.width,
      deltaY: event.deltaY * viewportRect.height,
    };
  }
  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
  };
}

function getGpuPointValueOnAxis(point: GpuPoint, axis: "x" | "y"): number {
  return axis === "x" ? point.x : point.y;
}

function getGpuRectCenterOnAxis(rect: GpuRect, axis: "x" | "y"): number {
  return axis === "x" ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
}

function getGpuRectMinOnAxis(rect: GpuRect, axis: "x" | "y"): number {
  return axis === "x" ? rect.x : rect.y;
}

function getGpuRectMaxOnAxis(rect: GpuRect, axis: "x" | "y"): number {
  return getGpuRectMinOnAxis(rect, axis) + getGpuRectSizeOnAxis(rect, axis);
}

function getGpuRectSizeOnAxis(rect: GpuRect, axis: "x" | "y"): number {
  return axis === "x" ? rect.width : rect.height;
}

function getGpuSectionSceneNodeDepth(
  section: GpuSectionSceneNode,
  sectionById: ReadonlyMap<string, GpuSectionSceneNode>,
): number {
  let depth = 0;
  let currentSectionId = section.parentSectionId;
  while (currentSectionId !== null) {
    const current = sectionById.get(currentSectionId);
    if (!current) {
      throw new Error(`Missing parent section scene node ${currentSectionId}.`);
    }
    depth += 1;
    currentSectionId = current.parentSectionId;
  }
  return depth;
}

function gpuRectContainsPoint(rect: GpuRect, point: GpuPoint): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function intersectGpuRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(maxY - y, 0),
    width: Math.max(maxX - x, 0),
    x,
    y,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}
