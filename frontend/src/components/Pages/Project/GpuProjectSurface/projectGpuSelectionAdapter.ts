import type { NodeDragItem } from "gpuFlow/flowTypes";

import type {
  GpuSelectionDragChange,
  GpuSelectionDragItem,
  GpuSelectionKeyboardNudgeChange,
} from "gpuFlow/interactions/selectionDrag";

import type { GpuFlowLayoutStoreApi } from "gpuFlow/layoutStore";

import {
  getGpuFlowSceneDomSectionNodes,
  type GpuFlowScene,
  type GpuSectionSceneNode,
} from "gpuFlow/scene";

import {
  isGpuSectionSceneOrderedChildLayout,
  resolveGpuSectionSceneChildMovePlan,
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
  raiseGpuLayoutDragTempZIndex(
    layoutStore,
    change.items.map((item) => item.nodeId),
  );
  useMisc.setState({ mouseDownDraggingSection: true });
}

export function handleProjectNodeDrag(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
) {
  void layoutStore;
  void change;
  // Live node positions and selected bounds are owned by GpuFlow during drag.
}

export function handleProjectNodeDragStop(
  layoutStore: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
  scene?: GpuFlowScene | undefined,
) {
  if (commitProjectNestedNodeDragStop(layoutStore, change, scene)) {
    return;
  }
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
  const item = nestedItems.length === 1 ? nestedItems[0] : null;
  if (!item) {
    restoreProjectSceneLayoutStore(layoutStore, scene);
    useMisc.setState({ mouseDownDraggingSection: false });
    return true;
  }
  const plan = resolveGpuSectionSceneChildMovePlan({
    canDropInParent: (parent, child) =>
      canDropProjectSceneChildInParent(parent.sectionId, child.sectionId),
    draggedRect: getProjectNodeDragItemRect(item),
    scene,
    sectionId: item.nodeId,
  });
  useMisc.setState({ mouseDownDraggingSection: false });
  if (!plan) {
    restoreProjectSceneLayoutStore(layoutStore, scene);
    return true;
  }
  if (!plan.changed) {
    restoreProjectSceneLayoutStore(layoutStore, scene);
    return true;
  }

  moveSectionsWithBackend({
    newIndex: plan.nextIndex,
    newParentId: plan.parentSectionId,
    positionsById: null,
    sectionIds: [plan.childSectionId],
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
