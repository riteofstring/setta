import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { Node, TopLevelSectionLayout } from "../document/types";
import { fitView } from "./fitView";
import { useReactFlow } from "./store";
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

export function getNodes(): Array<Node> {
  return Array.from(useNodeInternals.getState().x.values());
}

export function updateNodePositions(nodeDragItems: Array<NodeDragItem>) {
  const currentNodes = useNodeInternals.getState().x;
  const newNodes = new Map(currentNodes);
  for (const item of nodeDragItems) {
    const node = currentNodes.get(item.id);
    if (!node) {
      throw new Error(`Missing node ${item.id} during a drag position update.`);
    }
    // Preserve the reference's published position object while cloning only the node record that
    // changed. The drag loop replaces (rather than mutates) this object on its next frame.
    newNodes.set(item.id, { ...node, position: item.position });
  }
  useNodeInternals.setState({ x: newNodes });
}

export function raiseTempZIndex(items: Array<{ id: string }>) {
  const currentNodes = useNodeInternals.getState().x;
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
  useNodeInternals.setState({ x: newNodes });
}

// The reference funnels this through `debounced_route_set_top_level_section_layout`, which
// mirrors node geometry into the canonical config immediately and debounces only the backend
// send. The package keeps the immediate canonical mirror and notifies the host through the
// document-change callback (host-side debouncing is transport policy). Like the reference
// funnel, the layout dict is wholesale-replaced from entries filtered to parent-less sections,
// so a section that currently has a parent loses its stale top-level entry at the first layout
// write, and node geometry is written verbatim (a null measurement clears the stored size back
// to auto).
export function commitTopLevelLayoutToDocument() {
  const documentState = useWorkspaceDocument.getState();
  const nodeInternals = useNodeInternals.getState().x;
  const isTopLevel = (sectionId: string) =>
    (documentState.parentSectionMap[sectionId] ?? null) === null;

  const nextLayouts: Record<string, TopLevelSectionLayout> = {};
  for (const [sectionId, layout] of Object.entries(documentState.topLevelSections)) {
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
  useWorkspaceDocument.setState({ topLevelSections: nextLayouts });
  notifyWorkspaceDocumentChange();
}

export function updateNodeDimensionsFromResizeObserver(entries: Array<ResizeObserverEntry>) {
  if (!hasViewportNode()) {
    return;
  }

  const currentNodes = useNodeInternals.getState().x;
  const newNodes = new Map(currentNodes);
  let dimensionsChanged = false;
  for (const entry of entries) {
    dimensionsChanged = applyNodeDimensionUpdate(newNodes, entry) || dimensionsChanged;
  }
  if (dimensionsChanged) {
    useNodeInternals.setState({ x: newNodes });
  }
  commitTopLevelLayoutToDocument();
  maybeCompleteInitialFitView();
}

function hasViewportNode() {
  return !!useReactFlow.getState().domNode?.querySelector(".react-flow__viewport");
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
    throw new Error("Node resize observer received an element without a node id.");
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

// Also called by the load orchestrator after a mounted re-load arms fit-on-init: surviving
// sections keep their measurements, so the armed fit may be completable without waiting for a
// ResizeObserver pass.
export function maybeCompleteInitialFitView() {
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
