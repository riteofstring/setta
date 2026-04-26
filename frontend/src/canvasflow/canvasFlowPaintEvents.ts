export function getCanvasFlowChangedNodeIds(event: Event) {
  const changedElements = (event as { changedElements?: readonly Element[] })
    .changedElements;
  if (!changedElements || changedElements.length === 0) {
    return undefined;
  }
  const changedNodeIds = new Set<string>();
  for (const element of changedElements) {
    if (element instanceof HTMLElement && element.dataset.id) {
      changedNodeIds.add(element.dataset.id);
    }
  }
  return changedNodeIds.size > 0 ? changedNodeIds : undefined;
}
