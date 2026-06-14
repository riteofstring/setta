export function processedCartographerReadbackReady(value, processedCartographer) {
  const requiredPatchIds = [processedCartographer.patchId, processedCartographer.edgePatchId];
  return (
    value.run?.run?.status === "applied" &&
    processedCartographerWindowReadbackReady(value, processedCartographer.windowId) &&
    requiredPatchIds.every((patchId) => processedCartographerPatchReadbackReady(value, patchId)) &&
    value.detail?.detail?.node?.id === processedCartographer.nodeId
  );
}

export function assertProcessedCartographerResultReadback(
  result,
  processedCartographer,
  seedConstraintNodeId,
) {
  assertProcessedCartographerAuditReadback(result.run.run);
  assertProcessedCartographerPatchReadback(result, processedCartographer);
  assertProcessedCartographerNodeReadback(result, processedCartographer, seedConstraintNodeId);
}

function processedCartographerWindowReadbackReady(value, windowId) {
  return value.windows?.windows?.some((window) => window.id === windowId);
}

function processedCartographerPatchReadbackReady(value, patchId) {
  return value.patches?.patches?.some((patch) => patch.id === patchId);
}

function assertProcessedCartographerAuditReadback(run) {
  if (
    run.harnessKind !== "codex" ||
    run.requestId !== "scripted-cartographer-request" ||
    run.responseId !== "scripted-cartographer-response" ||
    run.rawHarnessResponseHash === ""
  ) {
    throw new Error("processed cartographer audit mismatch");
  }
}

function assertProcessedCartographerPatchReadback(result, processedCartographer) {
  const patch = result.patches.patches.find(
    (candidate) => candidate.id === processedCartographer.patchId,
  );
  const edgePatch = result.patches.patches.find(
    (candidate) => candidate.id === processedCartographer.edgePatchId,
  );
  if (
    !patch ||
    patch.patch.publicSummary !==
      "Scripted cartographer recorded a concrete workflow result finding." ||
    !edgePatch ||
    edgePatch.patch.operation !== "create_edge"
  ) {
    throw new Error("processed cartographer patch mismatch");
  }
}

function assertProcessedCartographerNodeReadback(
  result,
  processedCartographer,
  seedConstraintNodeId,
) {
  const hasEvidence = result.detail.detail.evidence.some(
    (evidence) => evidence.reassignedFromAnchorId === processedCartographer.evidenceAnchorId,
  );
  const hasNode = result.graph.nodes.some((node) => node.id === processedCartographer.nodeId);
  const hasSourceLink = result.graph.sourceLinks.some(
    (link) => link.targetEntityId === processedCartographer.nodeId,
  );
  const hasEdge = result.graph.edges.some(
    (edge) =>
      edge.fromNodeId === processedCartographer.nodeId && edge.toNodeId === seedConstraintNodeId,
  );
  if (!hasEvidence || !hasNode || !hasSourceLink || !hasEdge) {
    throw new Error("processed cartographer node mismatch");
  }
}
