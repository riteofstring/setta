import { publishNodeInternalsWithTopLevelLayout } from "../document/topLevelLayoutPublication.js";
import { normalizeNodeZIndices } from "../document/sectionZIndices.js";
import { getNodeInternalsStore } from "../document/stores.js";
import type { Node } from "../document/types.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { fitView } from "./fitView.js";
import { getReactFlowStore } from "./store.js";
import type { NodeDragItem } from "./types.js";
import type { WorkspaceXyflowNodeDimensions } from "./xyflow/types.js";

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
