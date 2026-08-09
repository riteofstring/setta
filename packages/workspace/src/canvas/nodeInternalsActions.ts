import _ from "lodash";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { Node, TopLevelSectionLayout } from "../document/types";
import { fitView } from "./fitView";
import { useReactFlow } from "./store";
import type { NodeDragItem } from "./types";
import { getDimensions } from "./utils";

export function getNodes(): Array<Node> {
  return Array.from(useNodeInternals.getState().x.values());
}

export function updateNodePositions(nodeDragItems: Array<NodeDragItem>) {
  const newNodes = getNewNodes();
  for (const item of nodeDragItems) {
    const node = newNodes.get(item.id);
    if (!node) {
      throw new Error(`Missing node ${item.id} during a drag position update.`);
    }
    node.position = item.position;
  }
  useNodeInternals.setState({ x: newNodes });
}

export function raiseTempZIndex(items: Array<{ id: string }>) {
  const newNodes = getNewNodes();
  for (const [, node] of newNodes) {
    node.tempZIndex = node.zIndex;
  }
  for (const item of items) {
    const node = newNodes.get(item.id);
    if (!node) {
      throw new Error(`Missing node ${item.id} during a temp z-index raise.`);
    }
    node.tempZIndex = node.zIndex + 1000;
  }
  useNodeInternals.setState({ x: newNodes });
}

// The reference funnels this through `debounced_route_set_top_level_section_layout`, which
// mirrors node geometry into the canonical config immediately and debounces only the backend
// send. The package keeps the immediate canonical mirror; the Phase 2 change-callback seam owns
// notifying the host.
export function commitTopLevelLayoutToDocument() {
  const documentState = useWorkspaceDocument.getState();
  const nodeInternals = useNodeInternals.getState().x;
  const nextLayouts: Record<string, TopLevelSectionLayout> = {
    ...documentState.topLevelSections,
  };
  for (const node of nodeInternals.values()) {
    if (!(node.id in documentState.sections)) {
      continue;
    }
    const existingLayout = nextLayouts[node.id];
    nextLayouts[node.id] = {
      x: node.position.x,
      y: node.position.y,
      zIndex: node.zIndex,
      w: node.width ?? existingLayout?.w ?? null,
      h: node.height ?? existingLayout?.h ?? null,
    };
  }
  useWorkspaceDocument.setState({ topLevelSections: nextLayouts });
}

export function updateNodeDimensionsFromResizeObserver(entries: Array<ResizeObserverEntry>) {
  if (!hasViewportNode()) {
    return;
  }

  const newNodes = getNewNodes();
  for (const entry of entries) {
    applyNodeDimensionUpdate(newNodes, entry);
  }
  useNodeInternals.setState({ x: newNodes });
  commitTopLevelLayoutToDocument();
  maybeCompleteInitialFitView();
}

function hasViewportNode() {
  return !!useReactFlow.getState().domNode?.querySelector(".react-flow__viewport");
}

function applyNodeDimensionUpdate(newNodes: Map<string, Node>, entry: ResizeObserverEntry) {
  const target = entry.target;
  if (!(target instanceof HTMLDivElement)) {
    throw new Error("Node resize observer received a non-node element.");
  }
  const nodeId = target.getAttribute("data-id");
  if (!nodeId) {
    throw new Error("Node resize observer received an element without a node id.");
  }
  const node = newNodes.get(nodeId);
  if (!node) {
    return;
  }
  const dimensions = getDimensions(target);
  if (!dimensions.width || !dimensions.height) {
    return;
  }
  newNodes.set(node.id, {
    ...node,
    ...dimensions,
  });
}

function maybeCompleteInitialFitView() {
  const { fitViewOnInit, fitViewOnInitDone, fitViewOnInitOptions } = useReactFlow.getState();
  if (!fitViewOnInit || fitViewOnInitDone) {
    return;
  }
  useReactFlow.setState({
    fitViewOnInitDone: fitView({
      initial: true,
      ...fitViewOnInitOptions,
    }),
  });
}

function getNewNodes() {
  return _.cloneDeep(useNodeInternals.getState().x);
}
