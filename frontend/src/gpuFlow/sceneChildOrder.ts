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
};

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
  const parent = sectionById.get(section.parentSectionId);
  if (!parent) {
    throw new Error(
      `Missing parent section scene node ${section.parentSectionId} for ${sectionId}.`,
    );
  }
  if (!isGpuSectionSceneOrderedChildLayout(parent.layoutMode)) {
    return null;
  }
  return resolveOrderedGpuSectionSceneChildReorderPlan({
    draggedRect,
    parent,
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
  sectionById,
  sectionId,
}: {
  readonly draggedRect: GpuRect;
  readonly parent: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly sectionId: string;
}): GpuSectionSceneChildReorderPlan {
  const childSectionIds = parent.childSectionIds.filter((childSectionId) =>
    sectionById.has(childSectionId),
  );
  const previousIndex = childSectionIds.indexOf(sectionId);
  if (previousIndex < 0) {
    throw new Error(
      `Section scene node ${sectionId} is parented to ${parent.sectionId} but is not listed in that parent's child order.`,
    );
  }

  const stationaryChildIds = childSectionIds.filter(
    (childSectionId) => childSectionId !== sectionId,
  );
  const axis = getGpuSectionSceneChildOrderAxis(parent.layoutMode);
  const draggedCenter = getGpuRectCenterOnAxis(draggedRect, axis);
  const nextIndex = getGpuSectionSceneChildInsertionIndex({
    axis,
    draggedCenter,
    sectionById,
    stationaryChildIds,
  });
  const nextChildSectionIds = insertGpuSectionSceneChildId(
    stationaryChildIds,
    nextIndex,
    sectionId,
  );

  return {
    changed: !areStringArraysEqual(childSectionIds, nextChildSectionIds),
    childSectionId: sectionId,
    childSectionIds: nextChildSectionIds,
    layoutMode: parent.layoutMode,
    nextIndex,
    parentSectionId: parent.sectionId,
    previousIndex,
  };
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
