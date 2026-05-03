import type { GpuFlowLayoutDropMarker } from "./layoutStore";
import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "./scene";
import { resolveGpuFlowSectionSceneLayout } from "./sceneLayout";
import type { GpuRect } from "./viewportMath";

type GpuSectionSceneChildReorderPlan = {
  readonly changed: boolean;
  readonly childSectionId: string;
  readonly childSectionIds: readonly string[];
  readonly layoutMode: GpuSectionSceneLayoutMode;
  readonly movedChildSectionIds: readonly string[];
  readonly nextIndex: number;
  readonly parentSectionId: string;
  readonly previousIndex: number;
  readonly previousParentChildSectionIds: readonly string[];
  readonly previousParentSectionId: string;
};

type GpuSectionSceneChildMovePlan = GpuSectionSceneChildReorderPlan;

const GPU_SECTION_CHILD_INSERTION_MARKER_INSET = 8;
const GPU_SECTION_CHILD_INSERTION_MARKER_THICKNESS = 4;

export function resolveGpuSectionSceneChildMovePreviewSections({
  plan,
  scene,
}: {
  readonly plan: GpuSectionSceneChildMovePlan;
  readonly scene: GpuFlowScene;
}): readonly GpuSectionSceneNode[] {
  const affectedParentIds = new Set([
    plan.parentSectionId,
    plan.previousParentSectionId,
  ]);
  const sectionById = getGpuSectionSceneNodeById(scene);
  const movedChildSectionIds = new Set(plan.movedChildSectionIds);
  const baseLocalRectByParentId =
    getGpuSectionSceneChildPreviewBaseLocalRectByParentId({
      affectedParentIds,
      sectionById,
    });
  const nextSections = scene.sections.map((section) => {
    let nextSection = section;
    if (movedChildSectionIds.has(section.sectionId)) {
      nextSection = {
        ...section,
        parentSectionId: plan.parentSectionId,
      };
    } else if (section.sectionId === plan.parentSectionId) {
      nextSection = {
        ...section,
        childSectionIds: plan.childSectionIds,
      };
    } else if (section.sectionId === plan.previousParentSectionId) {
      nextSection = {
        ...section,
        childSectionIds: plan.previousParentChildSectionIds,
      };
    }

    const parentSectionId = nextSection.parentSectionId;
    if (!parentSectionId || !affectedParentIds.has(parentSectionId)) {
      return nextSection;
    }
    const baseLocalRect = baseLocalRectByParentId.get(parentSectionId);
    if (!baseLocalRect) {
      return nextSection;
    }
    const parent = sectionById.get(parentSectionId);
    if (!parent) {
      return nextSection;
    }
    return normalizeGpuSectionSceneChildPreviewLocalRect({
      baseLocalRect,
      parentLayoutMode: parent.layoutMode,
      section: nextSection,
    });
  });
  return resolveGpuFlowSectionSceneLayout(nextSections);
}

export function resolveGpuSectionSceneChildMoveDropMarker({
  plan,
  scene,
}: {
  readonly plan: GpuSectionSceneChildMovePlan;
  readonly scene: GpuFlowScene;
}): GpuFlowLayoutDropMarker | null {
  const sectionById = getGpuSectionSceneNodeById(scene);
  const parent = sectionById.get(plan.parentSectionId);
  if (!parent) {
    throw new Error(
      `Missing drop marker parent section scene node ${plan.parentSectionId}.`,
    );
  }
  const previewSections = resolveGpuSectionSceneChildMovePreviewSections({
    plan,
    scene,
  });
  const previewSectionById = new Map(
    previewSections.map((section) => [section.sectionId, section]),
  );
  const previewParent = previewSectionById.get(plan.parentSectionId);
  const previewChild = previewSectionById.get(plan.childSectionId);
  if (!previewParent) {
    throw new Error(
      `Missing drop marker preview parent section scene node ${plan.parentSectionId}.`,
    );
  }
  if (!previewChild) {
    throw new Error(
      `Missing drop marker preview child section scene node ${plan.childSectionId}.`,
    );
  }
  const dropRect = getGpuSectionSceneChildDropRect(previewParent);
  if (dropRect.width <= 0 || dropRect.height <= 0) {
    return null;
  }
  const axis = getGpuSectionSceneChildOrderAxis(parent.layoutMode);
  const markerCenter = getGpuRectMinOnAxis(previewChild.worldRect, axis);
  return {
    axis,
    childNodeId: plan.childSectionId,
    index: plan.nextIndex,
    parentNodeId: plan.parentSectionId,
    rect:
      axis === "x"
        ? resolveHorizontalGpuSectionSceneDropMarkerRect({
            dropRect,
            markerCenter,
          })
        : resolveVerticalGpuSectionSceneDropMarkerRect({
            dropRect,
            markerCenter,
          }),
  };
}

function getGpuSectionSceneChildPreviewBaseLocalRectByParentId({
  affectedParentIds,
  sectionById,
}: {
  readonly affectedParentIds: ReadonlySet<string>;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
}): ReadonlyMap<string, GpuRect> {
  const baseLocalRectByParentId = new Map<string, GpuRect>();
  for (const parentSectionId of affectedParentIds) {
    const parent = sectionById.get(parentSectionId);
    if (!parent) {
      continue;
    }
    const firstChild = parent.childSectionIds
      .map((childSectionId) => sectionById.get(childSectionId) ?? null)
      .find((child) => child !== null);
    baseLocalRectByParentId.set(
      parentSectionId,
      firstChild?.localRect ?? {
        height: 0,
        width: 0,
        x: 0,
        y: 0,
      },
    );
  }
  return baseLocalRectByParentId;
}

function normalizeGpuSectionSceneChildPreviewLocalRect({
  baseLocalRect,
  parentLayoutMode,
  section,
}: {
  readonly baseLocalRect: GpuRect;
  readonly parentLayoutMode: GpuSectionSceneLayoutMode;
  readonly section: GpuSectionSceneNode;
}): GpuSectionSceneNode {
  if (parentLayoutMode === "horizontal" || parentLayoutMode === "kanban") {
    return {
      ...section,
      localRect: {
        ...section.localRect,
        x: baseLocalRect.x,
      },
    };
  }
  if (parentLayoutMode === "vertical") {
    return {
      ...section,
      localRect: {
        ...section.localRect,
        y: baseLocalRect.y,
      },
    };
  }
  return section;
}

function resolveVerticalGpuSectionSceneDropMarkerRect({
  dropRect,
  markerCenter,
}: {
  readonly dropRect: GpuRect;
  readonly markerCenter: number;
}): GpuRect {
  const inset = Math.min(
    GPU_SECTION_CHILD_INSERTION_MARKER_INSET,
    dropRect.width / 2,
  );
  return {
    height: GPU_SECTION_CHILD_INSERTION_MARKER_THICKNESS,
    width: Math.max(dropRect.width - inset * 2, 0),
    x: dropRect.x + inset,
    y: markerCenter - GPU_SECTION_CHILD_INSERTION_MARKER_THICKNESS / 2,
  };
}

function resolveHorizontalGpuSectionSceneDropMarkerRect({
  dropRect,
  markerCenter,
}: {
  readonly dropRect: GpuRect;
  readonly markerCenter: number;
}): GpuRect {
  const inset = Math.min(
    GPU_SECTION_CHILD_INSERTION_MARKER_INSET,
    dropRect.height / 2,
  );
  return {
    height: Math.max(dropRect.height - inset * 2, 0),
    width: GPU_SECTION_CHILD_INSERTION_MARKER_THICKNESS,
    x: markerCenter - GPU_SECTION_CHILD_INSERTION_MARKER_THICKNESS / 2,
    y: dropRect.y + inset,
  };
}

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
  return resolveGpuSectionSceneChildMultiMovePlan({
    canDropInParent,
    draggedRect,
    primarySectionId: sectionId,
    scene,
    sectionIds: [sectionId],
  });
}

export function resolveGpuSectionSceneChildMultiMovePlan({
  canDropInParent,
  draggedRect,
  primarySectionId,
  scene,
  sectionIds,
}: {
  readonly canDropInParent?:
    | ((parent: GpuSectionSceneNode, child: GpuSectionSceneNode) => boolean)
    | undefined;
  readonly draggedRect: GpuRect;
  readonly primarySectionId: string;
  readonly scene: GpuFlowScene;
  readonly sectionIds: readonly string[];
}): GpuSectionSceneChildMovePlan | null {
  const sectionById = getGpuSectionSceneNodeById(scene);
  const selection = resolveGpuSectionSceneChildMoveSelection({
    primarySectionId,
    sectionById,
    sectionIds,
  });
  if (!selection) {
    return null;
  }
  const targetParent =
    resolveGpuSectionSceneChildDropParent({
      canDropInParent,
      draggedRect,
      movedSections: selection.movedSections,
      scene,
      sectionById,
    }) ?? selection.previousParent;

  if (
    !isGpuSectionSceneOrderedChildLayout(targetParent.layoutMode) ||
    !canDropGpuSectionSceneChildrenInParent({
      canDropInParent,
      children: selection.movedSections,
      parent: targetParent,
    })
  ) {
    return null;
  }

  return resolveOrderedGpuSectionSceneChildReorderPlan({
    draggedRect,
    movedSectionIds: selection.movedSectionIds,
    parent: targetParent,
    previousParent: selection.previousParent,
    primarySectionId,
    sectionById,
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
    movedSectionIds: [sectionId],
    parent,
    previousParent: parent,
    primarySectionId: sectionId,
    sectionById,
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
  movedSectionIds,
  parent,
  previousParent,
  primarySectionId,
  sectionById,
}: {
  readonly draggedRect: GpuRect;
  readonly movedSectionIds: readonly string[];
  readonly parent: GpuSectionSceneNode;
  readonly previousParent: GpuSectionSceneNode;
  readonly primarySectionId: string;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
}): GpuSectionSceneChildReorderPlan {
  const movedSectionIdSet = new Set(movedSectionIds);
  const previousIndex = previousParent.childSectionIds.findIndex(
    (childSectionId) => movedSectionIdSet.has(childSectionId),
  );
  if (previousIndex < 0) {
    throw new Error(
      `Section scene node ${primarySectionId} is parented to ${previousParent.sectionId} but is not listed in that parent's child order.`,
    );
  }

  const childSectionIds = parent.childSectionIds.filter(
    (childSectionId) =>
      !movedSectionIdSet.has(childSectionId) && sectionById.has(childSectionId),
  );
  const previousParentChildSectionIds = previousParent.childSectionIds.filter(
    (childSectionId) => !movedSectionIdSet.has(childSectionId),
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
    movedSectionIds,
  );

  return {
    changed:
      previousParent.sectionId !== parent.sectionId ||
      !areStringArraysEqual(parent.childSectionIds, nextChildSectionIds),
    childSectionId: primarySectionId,
    childSectionIds: nextChildSectionIds,
    layoutMode: parent.layoutMode,
    movedChildSectionIds: movedSectionIds,
    nextIndex,
    parentSectionId: parent.sectionId,
    previousIndex,
    previousParentChildSectionIds,
    previousParentSectionId: previousParent.sectionId,
  };
}

function resolveGpuSectionSceneChildDropParent({
  canDropInParent,
  draggedRect,
  movedSections,
  scene,
  sectionById,
}: {
  readonly canDropInParent?:
    | ((parent: GpuSectionSceneNode, child: GpuSectionSceneNode) => boolean)
    | undefined;
  readonly draggedRect: GpuRect;
  readonly movedSections: readonly GpuSectionSceneNode[];
  readonly scene: GpuFlowScene;
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
        movedSections,
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
  movedSections,
  sectionById,
}: {
  readonly canDropInParent?:
    | ((parent: GpuSectionSceneNode, child: GpuSectionSceneNode) => boolean)
    | undefined;
  readonly candidate: GpuSectionSceneNode;
  readonly dropPoint: { readonly x: number; readonly y: number };
  readonly movedSections: readonly GpuSectionSceneNode[];
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
}): boolean {
  return (
    isGpuSectionSceneOrderedChildLayout(candidate.layoutMode) &&
    canDropGpuSectionSceneChildrenInParent({
      canDropInParent,
      children: movedSections,
      parent: candidate,
    }) &&
    movedSections.every(
      (section) =>
        !isGpuSectionSceneSameOrDescendant({
          candidateSectionId: candidate.sectionId,
          sectionId: section.sectionId,
          sectionById,
        }),
    ) &&
    gpuRectContainsPoint(getGpuSectionSceneChildDropRect(candidate), dropPoint)
  );
}

function resolveGpuSectionSceneChildMoveSelection({
  primarySectionId,
  sectionById,
  sectionIds,
}: {
  readonly primarySectionId: string;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly sectionIds: readonly string[];
}): {
  readonly movedSectionIds: readonly string[];
  readonly movedSections: readonly GpuSectionSceneNode[];
  readonly previousParent: GpuSectionSceneNode;
} | null {
  const primarySection = sectionById.get(primarySectionId);
  if (!primarySection || primarySection.parentSectionId === null) {
    return null;
  }
  const previousParent = getGpuSectionSceneParentNode(
    primarySection,
    sectionById,
  );
  const requestedSectionIds = new Set([primarySectionId, ...sectionIds]);
  for (const sectionId of requestedSectionIds) {
    const section = sectionById.get(sectionId);
    if (!section || section.parentSectionId !== previousParent.sectionId) {
      return null;
    }
  }
  const movedSectionIds = previousParent.childSectionIds.filter(
    (childSectionId) => requestedSectionIds.has(childSectionId),
  );
  if (movedSectionIds.length === 0) {
    return null;
  }
  return {
    movedSectionIds,
    movedSections: movedSectionIds.map((sectionId) => {
      const section = sectionById.get(sectionId);
      if (!section) {
        throw new Error(`Missing section scene child ${sectionId}.`);
      }
      return section;
    }),
    previousParent,
  };
}

function canDropGpuSectionSceneChildrenInParent({
  canDropInParent,
  children,
  parent,
}: {
  readonly canDropInParent?:
    | ((parent: GpuSectionSceneNode, child: GpuSectionSceneNode) => boolean)
    | undefined;
  readonly children: readonly GpuSectionSceneNode[];
  readonly parent: GpuSectionSceneNode;
}): boolean {
  return children.every((child) => canDropInParent?.(parent, child) !== false);
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

function getGpuRectMinOnAxis(rect: GpuRect, axis: "x" | "y"): number {
  return axis === "x" ? rect.x : rect.y;
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
  sectionIds: readonly string[],
): readonly string[] {
  return [
    ...childSectionIds.slice(0, index),
    ...sectionIds,
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
