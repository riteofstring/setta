import type { FitViewOptions, Node, NodeDragItem } from "gpuFlow/flowTypes";
import {
  getGpuNodesBounds,
  isMeasuredGpuNodeBoundsInput,
} from "gpuFlow/nodeBounds";
import { finishInitialFitView, fitView } from "gpuFlow/viewportActions";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStore,
} from "gpuFlow/viewportStore";
import _ from "lodash";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useSectionRefs,
  ZustandNodeInternalsState,
} from "state/definitions";
import { Position } from "utils/generatedTypes";

type NodeDimensionsUpdate = Array<{
  id: string;
  nodeElement: HTMLDivElement;
  forceUpdate: boolean;
}>;
type GpuLayoutDimensionUpdate = {
  id: string;
  height?: number | undefined;
  width?: number | undefined;
};
type NodesById = Map<string, Node>;

export function getNodes(s: null | ZustandNodeInternalsState = null) {
  const source = s ? s.x : useNodeInternals.getState().x;
  return Array.from(source.values());
}

export function addNodes(nodes: Array<Node>) {
  const newNodes = getNewNodes();
  for (const n of nodes) {
    newNodes.set(n.id, n);
  }
  useNodeInternals.setState({ x: newNodes });
}

export function deleteNodes(nodeIds: Array<string>) {
  const newNodes = getNewNodes();
  for (const n of nodeIds) {
    newNodes.delete(n);
  }
  useNodeInternals.setState({ x: newNodes });
}

export function updateNodeDimensions(updates: NodeDimensionsUpdate) {
  // GpuFlow owns top-level graph dimensions; DOM measurements only gate fitView.
  void updates;
  if (!hasViewportNode()) {
    return;
  }
  maybeCompleteInitialFitView();
}

export function updateNodeDimensionsFromGpuResize({
  id,
  height,
  width,
}: {
  id: string;
  height: number;
  width: number;
}): boolean {
  return updateNodeDimensionsFromGpuLayout({
    id,
    height,
    width,
    completeInitialFitView: false,
  });
}

export function updateNodeDimensionsFromGpuIntrinsicSize({
  id,
  height,
  width,
}: {
  id: string;
  height?: number | undefined;
  width?: number | undefined;
}): boolean {
  return updateNodeDimensionsFromGpuLayout({
    id,
    height,
    width,
    completeInitialFitView: true,
  });
}

export function updateNodeDimensionsFromGpuIntrinsicSizes(
  updates: GpuLayoutDimensionUpdate[],
): number {
  return updateNodeDimensionsFromGpuLayouts({
    updates,
    completeInitialFitView: true,
  });
}

function updateNodeDimensionsFromGpuLayout({
  id,
  height,
  width,
  completeInitialFitView,
}: {
  id: string;
  height?: number | undefined;
  width?: number | undefined;
  completeInitialFitView: boolean;
}): boolean {
  return (
    updateNodeDimensionsFromGpuLayouts({
      updates: [{ id, height, width }],
      completeInitialFitView,
    }) > 0
  );
}

function updateNodeDimensionsFromGpuLayouts({
  updates,
  completeInitialFitView,
}: {
  updates: GpuLayoutDimensionUpdate[];
  completeInitialFitView: boolean;
}): number {
  if (!hasViewportNode()) {
    return 0;
  }

  const currentNodes = useNodeInternals.getState().x;
  let newNodes: NodesById | null = null;
  const changedNodeIds: string[] = [];
  for (const update of updates) {
    const node = (newNodes ?? currentNodes).get(update.id);
    if (!node) {
      continue;
    }
    const nextNode = getNodeWithGpuLayoutDimensions(node, update);
    if (!nextNode) {
      continue;
    }
    newNodes ??= new Map(currentNodes);
    newNodes.set(update.id, nextNode);
    changedNodeIds.push(update.id);
  }
  if (!newNodes) {
    return 0;
  }
  useNodeInternals.setState({ x: newNodes });
  updateSelectionBoundsForDimensionUpdates(newNodes, changedNodeIds);
  maybeCompleteInitialFitViewForGpuLayoutUpdate(completeInitialFitView);
  return changedNodeIds.length;
}

function maybeCompleteInitialFitViewForGpuLayoutUpdate(enabled: boolean) {
  if (enabled) {
    maybeCompleteInitialFitView();
  }
}

function getNodeWithGpuLayoutDimensions(
  node: Node,
  update: GpuLayoutDimensionUpdate,
): Node | null {
  const nextWidth = update.width ?? node.width;
  const nextHeight = update.height ?? node.height;
  if (node.width === nextWidth && node.height === nextHeight) {
    return null;
  }
  return {
    ...node,
    height: nextHeight,
    width: nextWidth,
  };
}

function hasViewportNode() {
  return gpuFlowViewportStore.getState().domNode !== null;
}

function updateSelectionBoundsForDimensionUpdates(
  nodesById: NodesById,
  changedNodeIds: readonly string[],
) {
  const viewportState = gpuFlowViewportStore.getState();
  if (!viewportState.nodesSelectionBounds || changedNodeIds.length === 0) {
    return;
  }
  const changedNodeIdSet = new Set(changedNodeIds);
  const activeSectionIds = getActiveSectionUIIds();
  if (!activeSectionIds.some((sectionId) => changedNodeIdSet.has(sectionId))) {
    return;
  }
  const selectedNodes = activeSectionIds
    .map((sectionId) => nodesById.get(sectionId))
    .filter((node): node is Node => node !== undefined);
  viewportState.setNodesSelectionBounds(getGpuNodesBounds(selectedNodes));
}

function maybeCompleteInitialFitView() {
  const fitViewState = gpuFlowViewportStore.getState();
  if (!shouldAttemptInitialFitView(fitViewState)) {
    return;
  }
  const nodes = getMeasuredFitViewTargetNodes(
    fitViewState.fitViewOnInitOptions,
  );
  if (!nodes) {
    return;
  }
  const completed = fitView({
    bounds: getGpuNodesBounds(nodes),
    duration: fitViewState.fitViewOnInitOptions?.duration,
    initial: true,
    maxZoom: fitViewState.fitViewOnInitOptions?.maxZoom,
    minZoom: fitViewState.fitViewOnInitOptions?.minZoom,
    overviewWidth: useLocalStorage.getState().overviewTrueWidth,
    padding: fitViewState.fitViewOnInitOptions?.padding,
  });
  if (completed) {
    finishInitialFitView();
  }
}

function shouldAttemptInitialFitView(
  state: Pick<GpuFlowViewportStore, "fitViewOnInit" | "fitViewOnInitDone">,
): boolean {
  return (
    state.fitViewOnInit &&
    !state.fitViewOnInitDone &&
    areCodeAreasReadyForInitialFitView()
  );
}

function areCodeAreasReadyForInitialFitView(): boolean {
  const miscState = useMisc.getState();
  return miscState.numInitializedCodeAreas === miscState.numDisplayedCodeAreas;
}

function getMeasuredFitViewTargetNodes(options: FitViewOptions | undefined) {
  const nodes = getNodes();
  const targetNodes = filterFitViewTargetNodes(nodes, options);
  if (
    targetNodes.length === 0 ||
    !targetNodes.every((node) => isMeasuredGpuNodeBoundsInput(node))
  ) {
    return null;
  }
  return targetNodes;
}

function filterFitViewTargetNodes(
  nodes: Array<Node>,
  options: FitViewOptions | undefined,
) {
  if (!options?.nodes?.length) {
    return nodes;
  }
  const targetNodeIds = new Set(options.nodes.map((node) => node.id));
  return nodes.filter((node) => targetNodeIds.has(node.id));
}

export function updateNodePositions(nodeDragItems: Array<NodeDragItem>) {
  const newNodes = getNewNodes();
  for (const n of nodeDragItems) {
    const node = newNodes.get(n.id);
    if (!node) {
      throw new Error(`Missing node ${n.id}`);
    }
    node.position = n.position;
  }
  useNodeInternals.setState({ x: newNodes });
}

export function raiseTempZIndex(nodes: Array<Node>) {
  const newNodes = getNewNodes();
  for (const [, n] of newNodes) {
    n.tempZIndex = n.zIndex;
  }
  for (const n of nodes) {
    const node = newNodes.get(n.id);
    if (!node) {
      throw new Error(`Missing node ${n.id}`);
    }
    node.tempZIndex = node.zIndex + 1000;
  }
  useNodeInternals.setState({ x: newNodes });
}

export function moveNodes(
  nodeMoves: Array<{
    id: string;
    position: Position;
  }>,
) {
  if (nodeMoves.length === 0) {
    return;
  }
  const newNodes = getNewNodes();
  for (const move of nodeMoves) {
    const node = newNodes.get(move.id);
    if (!node) {
      throw new Error(`Missing node ${move.id}`);
    }
    node.position = move.position;
  }
  useNodeInternals.setState({ x: newNodes });
}

function getNewNodes() {
  return _.cloneDeep(useNodeInternals.getState().x);
}

export function getNodeUpdateInformation(entries, fromResizeObserver: boolean) {
  if (fromResizeObserver) {
    return entries.map((entry) => ({
      id: entry.target.getAttribute("data-id"),
      nodeElement: entry.target,
      forceUpdate: true,
    }));
  }
  const output: NodeDimensionsUpdate = [];
  const refState = useSectionRefs.getState().withNested;
  entries.forEach((nodeId) => {
    if (refState[nodeId]) {
      output.push({
        id: nodeId,
        nodeElement: refState[nodeId],
        forceUpdate: true,
      });
    }
  });
  return output;
}
