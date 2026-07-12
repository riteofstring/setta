import type { SemanticGraphChangeEvent, SemanticNodeDetail } from "@generated/backend";

export function semanticGraphChangeAffectsSemanticNodeInspection(
  event: SemanticGraphChangeEvent,
  target: { nodeId: string; workspaceId: string },
  detail: SemanticNodeDetail | null,
) {
  if (event.workspaceId !== target.workspaceId) {
    return false;
  }
  if (
    event.targetEntityIds.includes(target.nodeId) ||
    event.semanticNodeIds.includes(target.nodeId)
  ) {
    return true;
  }
  if (detail === null) {
    return semanticGraphChangeHasNoEntityScope(event);
  }
  if (
    event.semanticEdgeIds.some(
      (edgeId) =>
        detail.incomingEdges.some((edge) => edge.id === edgeId) ||
        detail.outgoingEdges.some((edge) => edge.id === edgeId),
    )
  ) {
    return true;
  }
  if (
    event.cartographerRunIds.some((runId) =>
      detail.cartographerRuns.some((run) => run.id === runId),
    )
  ) {
    return true;
  }
  if (
    event.cartographerWindowIds.some((windowId) =>
      detail.cartographerWindows.some((window) => window.id === windowId),
    )
  ) {
    return true;
  }
  if (
    event.cartographerPatchIds.some((patchId) =>
      detail.cartographerPatches.some((patch) => patch.id === patchId),
    )
  ) {
    return true;
  }
  return semanticGraphChangeHasNoEntityScope(event);
}

function semanticGraphChangeHasNoEntityScope(event: SemanticGraphChangeEvent) {
  return (
    event.semanticNodeIds.length === 0 &&
    event.semanticEdgeIds.length === 0 &&
    event.targetEntityIds.length === 0 &&
    event.cartographerRunIds.length === 0 &&
    event.cartographerWindowIds.length === 0 &&
    event.cartographerPatchIds.length === 0
  );
}
