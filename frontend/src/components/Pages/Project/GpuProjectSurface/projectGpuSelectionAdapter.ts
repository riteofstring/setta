import type { NodeDragItem } from "gpuFlow/flowTypes";

import type {
  GpuSelectionDragChange,
  GpuSelectionDragItem,
  GpuSelectionKeyboardNudgeChange,
} from "gpuFlow/interactions/selectionDrag";

import type {
  GpuFlowLayoutNode,
  GpuFlowLayoutNodePatch,
  GpuFlowLayoutStoreApi,
} from "gpuFlow/layoutStore";

import {
  getGpuFlowSceneDomSectionNodes,
  type GpuFlowScene,
  type GpuSectionSceneNode,
} from "gpuFlow/scene";

import {
  isGpuSectionSceneOrderedChildLayout,
  resolveGpuSectionSceneChildMoveDropMarker,
  resolveGpuSectionSceneChildMovePreviewSections,
  resolveGpuSectionSceneChildMultiMovePlan,
} from "gpuFlow/sceneChildOrder";

import type { GpuRect } from "gpuFlow/viewportMath";

import { applyActiveSectionChange } from "state/actions/activeSectionController";

import { setActiveSectionIds } from "state/actions/activeSections";

import { openSelectionContextMenu } from "state/actions/contextMenus";

import { updateNodePositions } from "state/actions/nodeInternals";

import {
  getCurrEffectiveSectionImpl,
  getSectionChildren,
  isBaseCodeSectionType,
} from "state/actions/sectionInfos";

import { moveSectionsWithBackend } from "state/actions/sections/moveSections";

import { setZIndices } from "state/actions/sections/sectionPositions";

import { getActiveSectionUIIds } from "state/activeSectionUI";

import { useLocalStorage, useMisc, useProjectState } from "state/definitions";

import { SectionTypeEnum } from "utils/generatedTypes";

import type {
  ProjectGpuNodeDragChange,
  ProjectGpuNodeDragItem,
  ProjectGpuSelectionChange,
  useProjectGpuSurfaceSettings,
} from "./projectGpuSurface";

export function handleProjectNodeDragStart(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
) {
  layoutStore.getState().setDragPreview(null);
  raiseGpuLayoutDragTempZIndex(
    layoutStore,
    change.items.map((item) => item.nodeId),
  );
  useMisc.setState({ mouseDownDraggingSection: true });
}

export function handleProjectNodeDrag(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
  scene?: GpuFlowScene | undefined,
) {
  previewProjectNestedNodeDrag(layoutStore, change, scene);
}

export function handleProjectNodeDragStop(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
  scene?: GpuFlowScene | undefined,
) {
  if (commitProjectNestedNodeDragStop(layoutStore, change, scene)) {
    return;
  }
  layoutStore.getState().setDragPreview(null);
  updateNodePositions(toNodeDragItems(change.items));
  useMisc.setState({ mouseDownDraggingSection: false });
  setZIndices(
    change.items.map((item) => item.nodeId),
    true,
  );
}

export function handleProjectNodeDragCancel(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
  scene?: GpuFlowScene | undefined,
) {
  if (restoreProjectNestedNodeDragCancel(layoutStore, change, scene)) {
    return;
  }
  layoutStore.getState().setDragPreview(null);
  updateNodePositions(toNodeDragItems(change.items));
  useMisc.setState({ mouseDownDraggingSection: false });
  setZIndices(
    change.items.map((item) => item.nodeId),
    true,
  );
}

export function handleProjectSelectionDragStart() {
  useMisc.setState({ mouseDownDraggingSection: true });
}

export function handleProjectSelectionDragStop(change: GpuSelectionDragChange) {
  commitProjectSelectionDrag(change);
}

export function handleProjectSelectionDragCancel(
  change: GpuSelectionDragChange,
) {
  commitProjectSelectionDrag(change);
}

export function handleProjectSelectionKeyboardNudge(
  change: GpuSelectionKeyboardNudgeChange,
) {
  updateNodePositions(toNodeDragItems(change.items));
}

export function handleProjectSelectionContextMenu(
  event: MouseEvent,
  selectedNodeIds: readonly string[],
) {
  openSelectionContextMenu(event, [...selectedNodeIds]);
}

export function handleProjectSelectionChange(
  change: ProjectGpuSelectionChange,
) {
  if (change.phase === "start") {
    applyActiveSectionChange(
      { interaction: "selection-rect", selectedIds: [] },
      { syncMode: "ui-only" },
    );
    return;
  }
  if (change.phase === "change") {
    applyActiveSectionChange(
      {
        interaction: "selection-rect",
        selectedIds: [...change.selectedNodeIds],
      },
      { syncMode: "ui-only" },
    );
    return;
  }
  if (change.phase === "end" && change.active) {
    setActiveSectionIds(getActiveSectionUIIds(), {
      forceDurableSync: true,
    });
  }
}

function toNodeDragItems(
  items: readonly (ProjectGpuNodeDragItem | GpuSelectionDragItem)[],
): NodeDragItem[] {
  return items.map((item) => ({
    distance: "distance" in item ? item.distance : { x: 0, y: 0 },
    height: item.height,
    id: item.nodeId,
    position: item.position,
    width: item.width,
  }));
}

export function canDragProjectNode(
  nodeId: string,
  scene?: GpuFlowScene | undefined,
): boolean {
  const projectState = useProjectState.getState();
  const parentSectionId = projectState.parentSectionMap[nodeId] ?? null;
  if (getCurrEffectiveSectionImpl(projectState, nodeId).positionAndSizeLocked) {
    return false;
  }
  if (parentSectionId === null) {
    return true;
  }
  return scene ? canDragProjectSceneChildNode(nodeId, scene) : false;
}

function commitProjectNestedNodeDragStop(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
  scene: GpuFlowScene | undefined,
): boolean {
  const nestedItems = getProjectNestedNodeDragItems(change, scene);
  if (!scene || nestedItems.length === 0) {
    return false;
  }
  const plan = resolveProjectNestedNodeDragMovePlan(change, scene, nestedItems);
  useMisc.setState({ mouseDownDraggingSection: false });
  if (!plan) {
    restoreProjectSceneLayoutStore(layoutStore, scene);
    return true;
  }
  if (!plan.changed) {
    restoreProjectSceneLayoutStore(layoutStore, scene);
    return true;
  }

  layoutStore.getState().setDragPreview(null);
  moveSectionsWithBackend({
    newIndex: plan.nextIndex,
    newParentId: plan.parentSectionId,
    positionsById: null,
    sectionIds: [...plan.movedChildSectionIds],
  });
  return true;
}

function restoreProjectNestedNodeDragCancel(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
  scene: GpuFlowScene | undefined,
): boolean {
  const nestedItems = getProjectNestedNodeDragItems(change, scene);
  if (!scene || nestedItems.length === 0) {
    return false;
  }
  restoreProjectSceneLayoutStore(layoutStore, scene);
  useMisc.setState({ mouseDownDraggingSection: false });
  return true;
}

function previewProjectNestedNodeDrag(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
  scene: GpuFlowScene | undefined,
): boolean {
  const nestedItems = getProjectNestedNodeDragItems(change, scene);
  if (!scene || nestedItems.length === 0) {
    return false;
  }
  const draggedNodeIds = new Set(change.items.map((item) => item.nodeId));
  const plan = resolveProjectNestedNodeDragMovePlan(change, scene, nestedItems);
  patchProjectNestedDragPreviewLayout(
    layoutStore,
    plan?.changed
      ? resolveGpuSectionSceneChildMovePreviewSections({ plan, scene })
      : scene.sections,
    {
      draggedNodeIds,
      dropMarker:
        plan?.changed === true
          ? resolveGpuSectionSceneChildMoveDropMarker({ plan, scene })
          : null,
    },
  );
  return true;
}

function patchProjectNestedDragPreviewLayout(
  layoutStore: GpuFlowLayoutStoreApi,
  targetSections: readonly GpuSectionSceneNode[],
  {
    draggedNodeIds,
    dropMarker,
  }: {
    readonly draggedNodeIds: ReadonlySet<string>;
    readonly dropMarker: ReturnType<
      typeof resolveGpuSectionSceneChildMoveDropMarker
    >;
  },
) {
  layoutStore.getState().setDragPreview({
    draggedNodeIds: [...draggedNodeIds],
    dropMarker,
  });
  const targetById = new Map(
    targetSections.map((section) => [section.sectionId, section]),
  );
  const patches = layoutStore
    .getState()
    .getNodes()
    .flatMap((node) =>
      getProjectNestedDragPreviewNodePatch({
        draggedNodeIds,
        node,
        targetById,
      }),
    );
  if (patches.length === 0) {
    return;
  }
  layoutStore.getState().patchNodes(patches, {
    phase: "change",
    reason: "drag",
  });
}

function getProjectNestedDragPreviewNodePatch({
  draggedNodeIds,
  node,
  targetById,
}: {
  readonly draggedNodeIds: ReadonlySet<string>;
  readonly node: GpuFlowLayoutNode;
  readonly targetById: ReadonlyMap<string, GpuSectionSceneNode>;
}): readonly GpuFlowLayoutNodePatch[] {
  if (draggedNodeIds.has(node.nodeId)) {
    return [];
  }
  const target = targetById.get(node.nodeId);
  if (!target || target.parentSectionId === null) {
    return [];
  }
  if (isProjectNestedDragPreviewNodeAligned(node, target)) {
    return [];
  }
  return [
    {
      height: target.height,
      nodeId: node.nodeId,
      width: target.width,
      x: target.x,
      y: target.y,
    },
  ];
}

function isProjectNestedDragPreviewNodeAligned(
  node: GpuFlowLayoutNode,
  target: GpuSectionSceneNode,
): boolean {
  return (
    node.x === target.x &&
    node.y === target.y &&
    node.width === target.width &&
    node.height === target.height
  );
}

function canDragProjectSceneChildNode(
  nodeId: string,
  scene: GpuFlowScene,
): boolean {
  const sceneNode = getProjectSceneSectionNode(scene, nodeId);
  if (!sceneNode || sceneNode.parentSectionId === null) {
    return false;
  }
  const parentNode = getProjectSceneSectionNode(
    scene,
    sceneNode.parentSectionId,
  );
  return parentNode
    ? isGpuSectionSceneOrderedChildLayout(parentNode.layoutMode) &&
        canDropProjectSceneChildInParent(parentNode.sectionId, nodeId)
    : false;
}

function canDropProjectSceneChildInParent(
  parentSectionId: string,
  childSectionId: string,
): boolean {
  // Keep Setta nesting policy in the project adapter; generic GpuFlow only receives scene geometry.
  const projectState = useProjectState.getState();
  const sectionImpl = getCurrEffectiveSectionImpl(
    projectState,
    parentSectionId,
  );
  const childImpl = getCurrEffectiveSectionImpl(projectState, childSectionId);
  if (isBaseCodeSectionType(sectionImpl.type)) {
    const children = getSectionChildren(projectState, parentSectionId);
    return (
      childImpl.type === SectionTypeEnum.Terminal &&
      (children.length === 0 ||
        (children.length === 1 && children[0] === childSectionId))
    );
  }
  return (
    sectionImpl.type === SectionTypeEnum.Group ||
    sectionImpl.type === SectionTypeEnum.ListRoot
  );
}

function isProjectSceneNestedNode(
  nodeId: string,
  scene: GpuFlowScene,
): boolean {
  const parentSectionId =
    getProjectSceneSectionNode(scene, nodeId)?.parentSectionId ?? null;
  return parentSectionId !== null;
}

function getProjectSceneSectionNode(
  scene: GpuFlowScene,
  nodeId: string,
): GpuSectionSceneNode | null {
  return scene.sections.find((section) => section.sectionId === nodeId) ?? null;
}

function getProjectNestedNodeDragItems(
  change: ProjectGpuNodeDragChange,
  scene: GpuFlowScene | undefined,
): readonly ProjectGpuNodeDragItem[] {
  if (!scene) {
    return [];
  }
  return change.items.filter((item) =>
    isProjectSceneNestedNode(item.nodeId, scene),
  );
}

function resolveProjectNestedNodeDragMovePlan(
  change: ProjectGpuNodeDragChange,
  scene: GpuFlowScene,
  nestedItems: readonly ProjectGpuNodeDragItem[],
) {
  const primaryItem = getProjectPrimaryNestedNodeDragItem(change, nestedItems);
  if (!primaryItem) {
    return null;
  }
  return resolveGpuSectionSceneChildMultiMovePlan({
    canDropInParent: (parent, child) =>
      canDropProjectSceneChildInParent(parent.sectionId, child.sectionId),
    draggedRect: getProjectNodeDragItemRect(primaryItem),
    primarySectionId: primaryItem.nodeId,
    scene,
    sectionIds: nestedItems.map((item) => item.nodeId),
  });
}

function getProjectPrimaryNestedNodeDragItem(
  change: ProjectGpuNodeDragChange,
  nestedItems: readonly ProjectGpuNodeDragItem[],
): ProjectGpuNodeDragItem | null {
  return (
    nestedItems.find((item) => item.nodeId === change.nodeId) ??
    nestedItems[0] ??
    null
  );
}

function getProjectNodeDragItemRect(item: ProjectGpuNodeDragItem): GpuRect {
  return {
    height: item.height ?? 0,
    width: item.width ?? 0,
    x: item.position.x,
    y: item.position.y,
  };
}

function restoreProjectSceneLayoutStore(
  layoutStore: GpuFlowLayoutStoreApi,
  scene: GpuFlowScene,
) {
  layoutStore.getState().setDragPreview(null);
  layoutStore.getState().replaceNodes(getGpuFlowSceneDomSectionNodes(scene), {
    phase: "commit",
    reason: "project-sync",
  });
}

export function resolveProjectWireColor({
  darkMode,
  settings,
}: {
  readonly darkMode: boolean;
  readonly settings: ReturnType<typeof useProjectGpuSurfaceSettings>;
}): string {
  const light = settings.wireColor ?? "#41506c";
  const dark = settings.wireColorDarkMode ?? "#bac2d3";
  return darkMode ? dark : light;
}

export function getVisibleProjectSurfaceWidth(width: number): number {
  const localStorageState = useLocalStorage.getState();
  return (
    width -
      localStorageState.overviewTrueWidth -
      localStorageState.uiEditorTrueWidth || 500
  );
}

function commitProjectSelectionDrag(change: GpuSelectionDragChange) {
  updateNodePositions(toNodeDragItems(change.items));
  useMisc.setState({ mouseDownDraggingSection: false });
  setZIndices([...change.selectedNodeIds], true);
}

function raiseGpuLayoutDragTempZIndex(
  layoutStore: GpuFlowLayoutStoreApi,
  nodeIds: readonly string[],
) {
  const raisedNodeIds = new Set(nodeIds);
  layoutStore.getState().patchNodes(
    layoutStore
      .getState()
      .getNodes()
      .map((node) => ({
        nodeId: node.nodeId,
        tempZIndex:
          (node.zIndex ?? 0) + (raisedNodeIds.has(node.nodeId) ? 1000 : 0),
      })),
    {
      phase: "start",
      reason: "drag",
    },
  );
}
