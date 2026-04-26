import { getElementDimensions } from "gpuFlow/domDimensions";
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
import {
  useMisc,
  useNodeInternals,
  useProjectState,
  useSectionRefs,
  ZustandNodeInternalsState,
} from "state/definitions";
import { Position } from "utils/generatedTypes";
import { scheduleEdgeHandlePositionUpdate } from "./edgeHandles";
import {
  debounced_route_set_top_level_section_layout,
  getSectionDescendants,
} from "./sectionInfos";

type NodeDimensionsUpdate = Array<{
  id: string;
  nodeElement: HTMLDivElement;
  forceUpdate: boolean;
}>;
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
  if (!hasViewportNode()) {
    return;
  }

  const newNodes = getNewNodes();
  applyNodeDimensionUpdates(newNodes, updates);
  useNodeInternals.setState({ x: newNodes });
  debounced_route_set_top_level_section_layout();
  maybeCompleteInitialFitView();
}

function hasViewportNode() {
  return gpuFlowViewportStore.getState().domNode !== null;
}

function applyNodeDimensionUpdates(
  newNodes: NodesById,
  updates: NodeDimensionsUpdate,
) {
  for (const update of updates) {
    applyNodeDimensionUpdate(newNodes, update);
  }
}

function applyNodeDimensionUpdate(
  newNodes: NodesById,
  update: NodeDimensionsUpdate[number],
) {
  const node = newNodes.get(update.id);
  if (!node) {
    return;
  }
  const dimensions = getElementDimensions(update.nodeElement);
  if (!shouldUpdateNodeDimensions(node, dimensions, update.forceUpdate)) {
    return;
  }
  newNodes.set(node.id, {
    ...node,
    ...dimensions,
  });
}

function shouldUpdateNodeDimensions(
  node: Node,
  dimensions: ReturnType<typeof getElementDimensions>,
  forceUpdate: boolean,
) {
  return !!(
    dimensions.width &&
    dimensions.height &&
    (node.width !== dimensions.width ||
      node.height !== dimensions.height ||
      forceUpdate)
  );
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
    newNodes.get(n.id).position = n.position;
  }
  useNodeInternals.setState({ x: newNodes });
  const sectionIds = new Set<string>();
  const projectState = useProjectState.getState();
  for (const item of nodeDragItems) {
    const descendants = getSectionDescendants(item.id, projectState);
    for (const id of descendants) {
      sectionIds.add(id);
    }
  }
  scheduleEdgeHandlePositionUpdate(Array.from(sectionIds));
}

export function raiseTempZIndex(nodes: Array<Node>) {
  const newNodes = getNewNodes();
  for (const [, n] of newNodes) {
    n.tempZIndex = n.zIndex;
  }
  for (const n of nodes) {
    newNodes.get(n.id).tempZIndex = newNodes.get(n.id).zIndex + 1000;
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
  const projectState = useProjectState.getState();
  const sectionIds = new Set<string>();
  for (const move of nodeMoves) {
    const descendants = getSectionDescendants(move.id, projectState);
    for (const id of descendants) {
      sectionIds.add(id);
    }
  }
  scheduleEdgeHandlePositionUpdate(Array.from(sectionIds));
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
