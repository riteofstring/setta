import { publishNodeInternalsWithTopLevelLayout } from "../document/topLevelLayoutPublication";
import { normalizeNodeZIndices } from "../document/sectionZIndices";
import { getNodeInternalsStore } from "../document/stores";
import type { Node } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import { fitView } from "./fitView";
import { getReactFlowStore } from "./store";
import type { NodeDragItem } from "./types";
import { getDimensions } from "./utils";
import type { WorkspaceXyflowNodeDimensions } from "./xyflow/types";

export function getNodes(host: WorkspaceHost): Array<Node> {
  return Array.from(getNodeInternalsStore(host).getState().x.values());
}

export function updateNodePositions(
  host: WorkspaceHost,
  nodeDragItems: Array<NodeDragItem>,
) {
  const nodeStore = getNodeInternalsStore(host);
  const currentNodes = nodeStore.getState().x;
  nodeStore.setState({
    x: createUpdatedNodePositions(currentNodes, nodeDragItems),
  });
}

export function updateNodePositionsAndCommit(
  host: WorkspaceHost,
  nodeDragItems: Array<NodeDragItem>,
  options: { normalizeZIndices?: Array<string> } = {},
): void {
  const nodeStore = getNodeInternalsStore(host);
  const positionedNodes = createUpdatedNodePositions(
    nodeStore.getState().x,
    nodeDragItems,
  );
  publishNodeInternalsWithTopLevelLayout(
    host,
    options.normalizeZIndices
      ? normalizeNodeZIndices(positionedNodes, options.normalizeZIndices)
      : positionedNodes,
    "section-move",
  );
}

function createUpdatedNodePositions(
  currentNodes: ReadonlyMap<string, Node>,
  nodeDragItems: Array<NodeDragItem>,
): Map<string, Node> {
  const newNodes = new Map(currentNodes);
  for (const item of nodeDragItems) {
    const node = currentNodes.get(item.id);
    if (!node) {
      throw new Error(`Missing node ${item.id} during a drag position update.`);
    }

    newNodes.set(item.id, { ...node, position: item.position });
  }
  return newNodes;
}

export function raiseTempZIndex(
  host: WorkspaceHost,
  items: Array<{ id: string }>,
) {
  const nodeStore = getNodeInternalsStore(host);
  const currentNodes = nodeStore.getState().x;
  const raisedIds = new Set(items.map(({ id }) => id));
  for (const id of raisedIds) {
    if (!currentNodes.has(id)) {
      throw new Error(`Missing node ${id} during a temp z-index raise.`);
    }
  }
  const newNodes = new Map(currentNodes);
  for (const [id, node] of currentNodes) {
    const tempZIndex = node.zIndex + (raisedIds.has(id) ? 1000 : 0);
    if (node.tempZIndex !== tempZIndex) {
      newNodes.set(id, { ...node, tempZIndex });
    }
  }
  nodeStore.setState({ x: newNodes });
}

export function commitTopLevelLayoutToDocument(
  host: WorkspaceHost,
  historyChangeKind: "section-move" | null = "section-move",
): void {
  publishNodeInternalsWithTopLevelLayout(
    host,
    getNodeInternalsStore(host).getState().x,
    historyChangeKind,
  );
}

export function updateNodeDimensionsFromResizeObserver(
  host: WorkspaceHost,
  entries: Array<ResizeObserverEntry>,
) {
  if (!hasViewportNode(host)) {
    return;
  }

  const nodeStore = getNodeInternalsStore(host);
  const currentNodes = nodeStore.getState().x;
  const newNodes = new Map(currentNodes);
  let dimensionsChanged = false;
  for (const entry of entries) {
    dimensionsChanged =
      applyNodeDimensionUpdate(newNodes, entry) || dimensionsChanged;
  }
  if (!dimensionsChanged) {
    commitTopLevelLayoutToDocument(host, null);
    maybeCompleteInitialFitView(host);
    return;
  }
  publishNodeInternalsWithTopLevelLayout(host, newNodes, null);
  maybeCompleteInitialFitView(host);
}

export function updateNodeDimensionsFromXyflow(
  host: WorkspaceHost,
  dimensions: ReadonlyArray<WorkspaceXyflowNodeDimensions>,
): void {
  const nodeStore = getNodeInternalsStore(host);
  const currentNodes = nodeStore.getState().x;
  const newNodes = new Map(currentNodes);
  let dimensionsChanged = false;

  for (const measurement of dimensions) {
    const node = newNodes.get(measurement.id);
    if (!node) {
      continue;
    }
    const width = getPositiveDimension(measurement.width, node.width);
    const height = getPositiveDimension(measurement.height, node.height);
    if (width === node.width && height === node.height) {
      continue;
    }
    newNodes.set(node.id, { ...node, width, height });
    dimensionsChanged = true;
  }

  if (dimensionsChanged) {
    publishNodeInternalsWithTopLevelLayout(host, newNodes, null);
  }
}

function getPositiveDimension(
  measurement: number | undefined,
  current: number | null,
): number | null {
  if (
    measurement === undefined ||
    !Number.isFinite(measurement) ||
    measurement <= 0
  ) {
    return current;
  }
  return measurement;
}

function hasViewportNode(host: WorkspaceHost) {
  return !!getReactFlowStore(host)
    .getState()
    .domNode?.querySelector(".react-flow__viewport");
}

function applyNodeDimensionUpdate(
  newNodes: Map<string, Node>,
  entry: ResizeObserverEntry,
): boolean {
  const target = entry.target;
  if (!(target instanceof HTMLDivElement)) {
    throw new Error("Node resize observer received a non-node element.");
  }
  const nodeId = target.getAttribute("data-id");
  if (!nodeId) {
    throw new Error(
      "Node resize observer received an element without a node id.",
    );
  }
  const node = newNodes.get(nodeId);
  if (!node) {
    return false;
  }
  const dimensions = getDimensions(target);
  if (!dimensions.width || !dimensions.height) {
    return false;
  }
  if (node.width === dimensions.width && node.height === dimensions.height) {
    return false;
  }
  newNodes.set(node.id, {
    ...node,
    ...dimensions,
  });
  return true;
}

export function maybeCompleteInitialFitView(host: WorkspaceHost) {
  const { fitViewOnInit, fitViewOnInitDone, fitViewOnInitOptions } =
    getReactFlowStore(host).getState();
  if (!fitViewOnInit || fitViewOnInitDone) {
    return;
  }
  getReactFlowStore(host).setState({
    fitViewOnInitDone: fitView(host, {
      initial: true,
      ...fitViewOnInitOptions,
    }),
  });
}
