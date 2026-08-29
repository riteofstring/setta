import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores";
import type { Node, TopLevelSectionLayout } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import { fitView } from "./fitView";
import { getReactFlowStore } from "./store";
import type { NodeDragItem } from "./types";
import { getDimensions } from "./utils";

function topLevelLayoutsEqual(
  current: Readonly<Record<string, TopLevelSectionLayout>>,
  next: Readonly<Record<string, TopLevelSectionLayout>>,
): boolean {
  const currentIds = Object.keys(current);
  const nextIds = Object.keys(next);
  if (currentIds.length !== nextIds.length) {
    return false;
  }
  return currentIds.every((sectionId, index) => {
    if (nextIds[index] !== sectionId) {
      return false;
    }
    const currentLayout = current[sectionId];
    const nextLayout = next[sectionId];
    return (
      currentLayout !== undefined &&
      nextLayout !== undefined &&
      currentLayout.x === nextLayout.x &&
      currentLayout.y === nextLayout.y &&
      currentLayout.w === nextLayout.w &&
      currentLayout.h === nextLayout.h &&
      currentLayout.zIndex === nextLayout.zIndex
    );
  });
}

export function getNodes(host: WorkspaceHost): Array<Node> {
  return Array.from(getNodeInternalsStore(host).getState().x.values());
}

export function updateNodePositions(
  host: WorkspaceHost,
  nodeDragItems: Array<NodeDragItem>,
) {
  const nodeStore = getNodeInternalsStore(host);
  const currentNodes = nodeStore.getState().x;
  const newNodes = new Map(currentNodes);
  for (const item of nodeDragItems) {
    const node = currentNodes.get(item.id);
    if (!node) {
      throw new Error(`Missing node ${item.id} during a drag position update.`);
    }

    newNodes.set(item.id, { ...node, position: item.position });
  }
  nodeStore.setState({ x: newNodes });
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
) {
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const nodeInternals = getNodeInternalsStore(host).getState().x;
  const isTopLevel = (sectionId: string) =>
    (documentState.parentSectionMap[sectionId] ?? null) === null;

  const nextLayouts: Record<string, TopLevelSectionLayout> = {};
  for (const [sectionId, layout] of Object.entries(
    documentState.topLevelSections,
  )) {
    if (sectionId in documentState.sections && isTopLevel(sectionId)) {
      nextLayouts[sectionId] = { ...layout };
    }
  }
  for (const node of nodeInternals.values()) {
    if (!(node.id in documentState.sections) || !isTopLevel(node.id)) {
      continue;
    }
    nextLayouts[node.id] = {
      x: node.position.x,
      y: node.position.y,
      zIndex: node.zIndex,
      w: node.width,
      h: node.height,
    };
  }
  if (topLevelLayoutsEqual(documentState.topLevelSections, nextLayouts)) {
    return;
  }
  documentStore.setState({ topLevelSections: nextLayouts });
  notifyWorkspaceDocumentChange(host, historyChangeKind);
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
  if (dimensionsChanged) {
    nodeStore.setState({ x: newNodes });
  }
  commitTopLevelLayoutToDocument(host, null);
  maybeCompleteInitialFitView(host);
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
