import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "./scene";
import type { GpuRect } from "./viewportMath";

export type GpuSectionSceneChildReorderPlan = {
  readonly changed: boolean;
  readonly childSectionId: string;
  readonly childSectionIds: readonly string[];
  readonly layoutMode: GpuSectionSceneLayoutMode;
  readonly nextIndex: number;
  readonly parentSectionId: string;
  readonly previousIndex: number;
  readonly previousParentSectionId: string;
};

export type GpuSectionSceneChildMovePlan = GpuSectionSceneChildReorderPlan;

export function resolveGpuSectionSceneChildMovePlan({
  canDropInParent,
  draggedRect,
  scene,
  sectionId,
}: {
  readonly canDropInParent?:
    | ((parent: GpuSectionSceneNode, child: GpuSectionSceneNode) => boolean)
    | undefined;
  readonly draggedRect: GpuRect;
  readonly scene: GpuFlowScene;
  readonly sectionId: string;
}): GpuSectionSceneChildMovePlan | null {
  const sectionById = getGpuSectionSceneNodeById(scene);
  const section = sectionById.get(sectionId);
  if (!section) {
    return null;
  }
  if (section.parentSectionId === null) {
    return null;
  }
  const previousParent = getGpuSectionSceneParentNode(section, sectionById);
  const targetParent =
    resolveGpuSectionSceneChildDropParent({
      canDropInParent,
      draggedRect,
      scene,
      section,
      sectionById,
    }) ?? previousParent;

  if (
    !isGpuSectionSceneOrderedChildLayout(targetParent.layoutMode) ||
    canDropInParent?.(targetParent, section) === false
  ) {
    return null;
  }

  return resolveOrderedGpuSectionSceneChildReorderPlan({
    draggedRect,
    parent: targetParent,
    previousParent,
    sectionById,
    sectionId,
  });
}

export function resolveGpuSectionSceneChildReorderPlan({
  draggedRect,
  scene,
  sectionId,
}: {
  readonly draggedRect: GpuRect;
  readonly scene: GpuFlowScene;
  readonly sectionId: string;
}): GpuSectionSceneChildReorderPlan | null {
  const sectionById = getGpuSectionSceneNodeById(scene);
  const section = sectionById.get(sectionId);
  if (!section) {
    return null;
  }
  if (section.parentSectionId === null) {
    return null;
  }
  const parent = getGpuSectionSceneParentNode(section, sectionById);
  if (!isGpuSectionSceneOrderedChildLayout(parent.layoutMode)) {
    return null;
  }
  return resolveOrderedGpuSectionSceneChildReorderPlan({
    draggedRect,
    parent,
    previousParent: parent,
    sectionById,
    sectionId,
  });
}

export function isGpuSectionSceneOrderedChildLayout(
  layoutMode: GpuSectionSceneLayoutMode,
): boolean {
  return (
    layoutMode === "horizontal" ||
    layoutMode === "kanban" ||
    layoutMode === "vertical"
  );
}

function resolveOrderedGpuSectionSceneChildReorderPlan({
  draggedRect,
  parent,
  previousParent,
  sectionById,
  sectionId,
}: {
  readonly draggedRect: GpuRect;
  readonly parent: GpuSectionSceneNode;
  readonly previousParent: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly sectionId: string;
}): GpuSectionSceneChildReorderPlan {
  const previousIndex = previousParent.childSectionIds.indexOf(sectionId);
  if (previousIndex < 0) {
    throw new Error(
      `Section scene node ${sectionId} is parented to ${previousParent.sectionId} but is not listed in that parent's child order.`,
    );
  }

  const childSectionIds = parent.childSectionIds.filter(
    (childSectionId) =>
      childSectionId !== sectionId && sectionById.has(childSectionId),
  );
  const axis = getGpuSectionSceneChildOrderAxis(parent.layoutMode);
  const draggedCenter = getGpuRectCenterOnAxis(draggedRect, axis);
  const nextIndex = getGpuSectionSceneChildInsertionIndex({
    axis,
    draggedCenter,
    sectionById,
    stationaryChildIds: childSectionIds,
  });
  const nextChildSectionIds = insertGpuSectionSceneChildId(
    childSectionIds,
    nextIndex,
    sectionId,
  );

  return {
    changed:
      previousParent.sectionId !== parent.sectionId ||
      !areStringArraysEqual(parent.childSectionIds, nextChildSectionIds),
    childSectionId: sectionId,
    childSectionIds: nextChildSectionIds,
    layoutMode: parent.layoutMode,
    nextIndex,
    parentSectionId: parent.sectionId,
    previousIndex,
    previousParentSectionId: previousParent.sectionId,
  };
}

function resolveGpuSectionSceneChildDropParent({
  canDropInParent,
  draggedRect,
  scene,
  section,
  sectionById,
}: {
  readonly canDropInParent?:
    | ((parent: GpuSectionSceneNode, child: GpuSectionSceneNode) => boolean)
    | undefined;
  readonly draggedRect: GpuRect;
  readonly scene: GpuFlowScene;
  readonly section: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
}): GpuSectionSceneNode | null {
  const dropPoint = getGpuRectCenter(draggedRect);
  const candidates = scene.sections
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) =>
      isGpuSectionSceneChildDropParentCandidate({
        canDropInParent,
        candidate,
        dropPoint,
        section,
        sectionById,
      }),
    )
    .map(({ candidate, index }) => ({
      candidate,
      depth: getGpuSectionSceneNodeDepth(candidate, sectionById),
      index,
    }))
    .sort(
      (left, right) =>
        right.depth - left.depth ||
        (right.candidate.zIndex ?? 0) - (left.candidate.zIndex ?? 0) ||
        right.index - left.index,
    );

  return candidates[0]?.candidate ?? null;
}

function isGpuSectionSceneChildDropParentCandidate({
  canDropInParent,
  candidate,
  dropPoint,
  section,
  sectionById,
}: {
  readonly canDropInParent?:
    | ((parent: GpuSectionSceneNode, child: GpuSectionSceneNode) => boolean)
    | undefined;
  readonly candidate: GpuSectionSceneNode;
  readonly dropPoint: { readonly x: number; readonly y: number };
  readonly section: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
}): boolean {
  return (
    isGpuSectionSceneOrderedChildLayout(candidate.layoutMode) &&
    canDropInParent?.(candidate, section) !== false &&
    !isGpuSectionSceneSameOrDescendant({
      candidateSectionId: candidate.sectionId,
      sectionId: section.sectionId,
      sectionById,
    }) &&
    gpuRectContainsPoint(getGpuSectionSceneChildDropRect(candidate), dropPoint)
  );
}

function getGpuSectionSceneParentNode(
  section: GpuSectionSceneNode,
  sectionById: ReadonlyMap<string, GpuSectionSceneNode>,
): GpuSectionSceneNode {
  if (section.parentSectionId === null) {
    throw new Error(`Section scene node ${section.sectionId} has no parent.`);
  }
  const parent = sectionById.get(section.parentSectionId);
  if (!parent) {
    throw new Error(
      `Missing parent section scene node ${section.parentSectionId} for ${section.sectionId}.`,
    );
  }
  return parent;
}

function isGpuSectionSceneSameOrDescendant({
  candidateSectionId,
  sectionById,
  sectionId,
}: {
  readonly candidateSectionId: string;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly sectionId: string;
}): boolean {
  let currentSectionId: string | null = candidateSectionId;
  while (currentSectionId !== null) {
    if (currentSectionId === sectionId) {
      return true;
    }
    const current = sectionById.get(currentSectionId);
    if (!current) {
      throw new Error(`Missing section scene node ${currentSectionId}.`);
    }
    currentSectionId = current.parentSectionId;
  }
  return false;
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

function getGpuSectionSceneChildDropRect(
  section: GpuSectionSceneNode,
): GpuRect {
  return intersectGpuRects(section.childViewportRect ?? section.bodyRect, {
    height: section.clipRect.height,
    width: section.clipRect.width,
    x: section.clipRect.x,
    y: section.clipRect.y,
  });
}

function getGpuSectionSceneChildInsertionIndex({
  axis,
  draggedCenter,
  sectionById,
  stationaryChildIds,
}: {
  readonly axis: "x" | "y";
  readonly draggedCenter: number;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly stationaryChildIds: readonly string[];
}): number {
  for (const [index, childSectionId] of stationaryChildIds.entries()) {
    const child = sectionById.get(childSectionId);
    if (!child) {
      throw new Error(`Missing section scene child ${childSectionId}.`);
    }
    if (draggedCenter < getGpuRectCenterOnAxis(child.worldRect, axis)) {
      return index;
    }
  }
  return stationaryChildIds.length;
}

function getGpuSectionSceneChildOrderAxis(
  layoutMode: GpuSectionSceneLayoutMode,
): "x" | "y" {
  return layoutMode === "horizontal" || layoutMode === "kanban" ? "x" : "y";
}

function getGpuRectCenterOnAxis(rect: GpuRect, axis: "x" | "y"): number {
  return axis === "x" ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
}

function getGpuRectCenter(rect: GpuRect): {
  readonly x: number;
  readonly y: number;
} {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function gpuRectContainsPoint(
  rect: GpuRect,
  point: { readonly x: number; readonly y: number },
): boolean {
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

function getGpuSectionSceneNodeById(
  scene: GpuFlowScene,
): ReadonlyMap<string, GpuSectionSceneNode> {
  return new Map(scene.sections.map((section) => [section.sectionId, section]));
}

function insertGpuSectionSceneChildId(
  childSectionIds: readonly string[],
  index: number,
  sectionId: string,
): readonly string[] {
  return [
    ...childSectionIds.slice(0, index),
    sectionId,
    ...childSectionIds.slice(index),
  ];
}

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
