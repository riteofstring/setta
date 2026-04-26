export type CanvasFlowChangedNodeElements = {
  descendantNodeIds: Set<string>;
  directNodeIds: Set<string>;
  nodeIds: Set<string>;
};

export function getCanvasFlowChangedNodeIds(event: Event) {
  return getCanvasFlowChangedNodeElements(event)?.nodeIds;
}

export function getCanvasFlowChangedNodeElements(
  event: Event,
): CanvasFlowChangedNodeElements | undefined {
  const changedElements = (event as { changedElements?: readonly Element[] })
    .changedElements;
  if (!changedElements || changedElements.length === 0) {
    return undefined;
  }
  const descendantNodeIds = new Set<string>();
  const directNodeIds = new Set<string>();
  const nodeIds = new Set<string>();
  for (const element of changedElements) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    if (element.dataset.id) {
      directNodeIds.add(element.dataset.id);
      nodeIds.add(element.dataset.id);
      continue;
    }
    const nodeElement = element.closest<HTMLElement>("[data-id]");
    if (nodeElement?.dataset.id) {
      descendantNodeIds.add(nodeElement.dataset.id);
      nodeIds.add(nodeElement.dataset.id);
    }
  }
  return nodeIds.size > 0
    ? {
        descendantNodeIds,
        directNodeIds,
        nodeIds,
      }
    : undefined;
}
