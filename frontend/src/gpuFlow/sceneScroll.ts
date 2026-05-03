import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "./scene";
import { resolveGpuFlowSceneLayout } from "./sceneLayout";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuSectionSceneScrollOffsetMap = ReadonlyMap<string, GpuPoint>;

export type GpuSectionSceneScrollResult = {
  readonly changed: boolean;
  readonly parentSectionId: string | null;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
};

type GpuSectionSceneDragAutoScrollResult = GpuSectionSceneScrollResult;

type GpuSectionSceneWheelScrollResult = GpuSectionSceneScrollResult;

export type GpuSectionSceneRevealRectResult = GpuSectionSceneScrollResult;

type GpuSectionSceneKeyboardScrollResult = GpuSectionSceneScrollResult;

export type GpuSectionSceneRevealRectAlignment =
  | "center"
  | "end"
  | "nearest"
  | "start";

export type GpuSectionSceneKeyboardScrollCommand =
  | "end"
  | "line-backward"
  | "line-forward"
  | "page-backward"
  | "page-forward"
  | "start";

const DEFAULT_SCENE_DRAG_AUTO_SCROLL_MARGIN_PX = 48;
const DEFAULT_SCENE_DRAG_AUTO_SCROLL_MAX_SPEED_PX = 20;
const DEFAULT_SCENE_KEYBOARD_SCROLL_LINE_PX = 40;
const DEFAULT_SCENE_KEYBOARD_SCROLL_PAGE_FACTOR = 0.875;
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
  const context = getGpuSectionSceneScrollRegionContext({
    label: "drag auto-scroll",
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
  const maxOffset = getGpuSectionSceneMaxScrollOffsetOnAxis({
    axis: context.axis,
    parent: context.parent,
    sectionById: context.sectionById,
  });
  return resolveGpuSectionSceneScrollAxisOffset({
    axis: context.axis,
    maxOffset,
    nextAxisOffset:
      getGpuPointValueOnAxis(
        scrollOffsets.get(context.parent.sectionId) ??
          context.parent.scrollOffset,
        context.axis,
      ) + delta,
    parent: context.parent,
    scrollOffsets,
  });
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
  const maxOffset = getGpuSectionSceneMaxScrollOffsetOnAxis({
    axis: context.axis,
    parent: context.parent,
    sectionById: context.sectionById,
  });
  return resolveGpuSectionSceneScrollAxisOffset({
    axis: context.axis,
    maxOffset,
    nextAxisOffset:
      getGpuPointValueOnAxis(
        scrollOffsets.get(context.parent.sectionId) ??
          context.parent.scrollOffset,
        context.axis,
      ) + delta,
    parent: context.parent,
    scrollOffsets,
  });
}

export function resolveGpuSectionSceneRevealRect({
  align = "nearest",
  marginPx = 0,
  parentSectionId,
  rect,
  scene,
  scrollOffsets,
}: {
  readonly align?: GpuSectionSceneRevealRectAlignment | undefined;
  readonly marginPx?: number | undefined;
  readonly parentSectionId: string | null;
  readonly rect: GpuRect;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
}): GpuSectionSceneRevealRectResult {
  assertFiniteNonNegative("section scene reveal margin", marginPx);
  assertFiniteGpuRect("section scene reveal rect", rect);
  const context = getGpuSectionSceneScrollRegionContext({
    label: "reveal",
    parentSectionId,
    scene,
  });
  if (!context) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const currentOffset =
    scrollOffsets.get(context.parent.sectionId) ?? context.parent.scrollOffset;
  const maxOffset = getGpuSectionSceneMaxScrollOffsetOnAxis({
    axis: context.axis,
    parent: context.parent,
    sectionById: context.sectionById,
  });
  return resolveGpuSectionSceneScrollAxisOffset({
    axis: context.axis,
    maxOffset,
    nextAxisOffset: getGpuSectionSceneRevealRectAxisOffset({
      align,
      axis: context.axis,
      currentOffset: getGpuPointValueOnAxis(currentOffset, context.axis),
      marginPx,
      rect,
      viewportRect: context.viewportRect,
    }),
    parent: context.parent,
    scrollOffsets,
  });
}

export function resolveGpuSectionSceneKeyboardScroll({
  command,
  linePx = DEFAULT_SCENE_KEYBOARD_SCROLL_LINE_PX,
  pageFactor = DEFAULT_SCENE_KEYBOARD_SCROLL_PAGE_FACTOR,
  parentSectionId,
  scene,
  scrollOffsets,
}: {
  readonly command: GpuSectionSceneKeyboardScrollCommand;
  readonly linePx?: number | undefined;
  readonly pageFactor?: number | undefined;
  readonly parentSectionId: string | null;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
}): GpuSectionSceneKeyboardScrollResult {
  assertFiniteNonNegative("section scene keyboard scroll line size", linePx);
  assertFiniteNonNegative(
    "section scene keyboard scroll page factor",
    pageFactor,
  );
  const context = getGpuSectionSceneScrollRegionContext({
    label: "keyboard scroll",
    parentSectionId,
    scene,
  });
  if (!context) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const currentOffset =
    scrollOffsets.get(context.parent.sectionId) ?? context.parent.scrollOffset;
  const maxOffset = getGpuSectionSceneMaxScrollOffsetOnAxis({
    axis: context.axis,
    parent: context.parent,
    sectionById: context.sectionById,
  });
  return resolveGpuSectionSceneScrollAxisOffset({
    axis: context.axis,
    maxOffset,
    nextAxisOffset: getGpuSectionSceneKeyboardScrollAxisOffset({
      axis: context.axis,
      command,
      currentOffset: getGpuPointValueOnAxis(currentOffset, context.axis),
      linePx,
      maxOffset,
      pageFactor,
      viewportRect: context.viewportRect,
    }),
    parent: context.parent,
    scrollOffsets,
  });
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

function getGpuSectionSceneScrollRegionContext({
  label,
  parentSectionId,
  scene,
}: {
  readonly label: string;
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
      `Missing ${label} parent section scene node ${parentSectionId}.`,
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

function resolveGpuSectionSceneScrollAxisOffset({
  axis,
  maxOffset,
  nextAxisOffset,
  parent,
  scrollOffsets,
}: {
  readonly axis: "x" | "y";
  readonly maxOffset: number;
  readonly nextAxisOffset: number;
  readonly parent: GpuSectionSceneNode;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
}): GpuSectionSceneScrollResult {
  const currentOffset =
    scrollOffsets.get(parent.sectionId) ?? parent.scrollOffset;
  const clampedAxisOffset = clampNumber(nextAxisOffset, 0, maxOffset);
  if (clampedAxisOffset === getGpuPointValueOnAxis(currentOffset, axis)) {
    return unchangedGpuSectionSceneDragAutoScroll(scrollOffsets);
  }
  const nextOffsets = new Map(scrollOffsets);
  nextOffsets.set(parent.sectionId, {
    ...currentOffset,
    [axis]: clampedAxisOffset,
  });
  return {
    changed: true,
    parentSectionId: parent.sectionId,
    scrollOffsets: nextOffsets,
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

function getGpuSectionSceneRevealRectAxisOffset({
  align,
  axis,
  currentOffset,
  marginPx,
  rect,
  viewportRect,
}: {
  readonly align: GpuSectionSceneRevealRectAlignment;
  readonly axis: "x" | "y";
  readonly currentOffset: number;
  readonly marginPx: number;
  readonly rect: GpuRect;
  readonly viewportRect: GpuRect;
}): number {
  const viewportSize = getGpuRectSizeOnAxis(viewportRect, axis);
  const targetStart = getGpuRectMinOnAxis(rect, axis) - marginPx;
  const targetEnd = getGpuRectMaxOnAxis(rect, axis) + marginPx;
  if (align === "start") {
    return targetStart;
  }
  if (align === "end") {
    return targetEnd - viewportSize;
  }
  if (align === "center") {
    return (targetStart + targetEnd - viewportSize) / 2;
  }
  const viewportStart = currentOffset;
  const viewportEnd = currentOffset + viewportSize;
  if (targetStart < viewportStart) {
    return targetStart;
  }
  if (targetEnd > viewportEnd) {
    return targetEnd - viewportSize;
  }
  return currentOffset;
}

function getGpuSectionSceneKeyboardScrollAxisOffset({
  axis,
  command,
  currentOffset,
  linePx,
  maxOffset,
  pageFactor,
  viewportRect,
}: {
  readonly axis: "x" | "y";
  readonly command: GpuSectionSceneKeyboardScrollCommand;
  readonly currentOffset: number;
  readonly linePx: number;
  readonly maxOffset: number;
  readonly pageFactor: number;
  readonly viewportRect: GpuRect;
}): number {
  if (command === "start") {
    return 0;
  }
  if (command === "end") {
    return maxOffset;
  }
  const direction =
    command === "line-backward" || command === "page-backward" ? -1 : 1;
  const distance =
    command === "line-backward" || command === "line-forward"
      ? linePx
      : getGpuRectSizeOnAxis(viewportRect, axis) * pageFactor;
  return currentOffset + direction * distance;
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

function assertFiniteGpuRect(name: string, rect: GpuRect) {
  assertFiniteNumber(`${name} x`, rect.x);
  assertFiniteNumber(`${name} y`, rect.y);
  assertFiniteNonNegative(`${name} width`, rect.width);
  assertFiniteNonNegative(`${name} height`, rect.height);
}
