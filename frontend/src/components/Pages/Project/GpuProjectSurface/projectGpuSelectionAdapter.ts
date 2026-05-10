import type { NodeDragItem } from "gpuFlow/flowTypes";

import type {
  GpuSelectionDragChange,
  GpuSelectionDragItem,
  GpuSelectionKeyboardNudgeChange,
} from "gpuFlow/interactions/selectionDrag";

import type { GpuFlowLayoutStoreApi } from "gpuFlow/layoutStore";

import { applyActiveSectionChange } from "state/actions/activeSectionController";

import { setActiveSectionIds } from "state/actions/activeSections";

import { openSelectionContextMenu } from "state/actions/contextMenus";

import { updateNodePositions } from "state/actions/nodeInternals";

import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";

import { setZIndices } from "state/actions/sections/sectionPositions";

import { getActiveSectionUIIds } from "state/activeSectionUI";

import { useLocalStorage, useMisc, useProjectState } from "state/definitions";

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
  _: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
) {
  updateNodePositions(toNodeDragItems(change.items));
  useMisc.setState({ mouseDownDraggingSection: false });
  setZIndices(
    change.items.map((item) => item.nodeId),
    true,
  );
}

export function handleProjectNodeDragCancel(
  _: GpuFlowLayoutStoreApi,
  change: ProjectGpuNodeDragChange,
) {
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

export function canDragProjectNode(nodeId: string): boolean {
  return !getCurrEffectiveSectionImpl(useProjectState.getState(), nodeId)
    .positionAndSizeLocked;
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
