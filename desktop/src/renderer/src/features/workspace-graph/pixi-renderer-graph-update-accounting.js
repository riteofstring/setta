const graphUpdateSources = [
  "initial-mount",
  "workflow-projection",
  "semantic-graph",
  "semantic-activity",
  "draft-validation-local",
  "layout",
];
const graphUpdateSourceSet = new Set(graphUpdateSources);

export function requireGraphUpdateMetadataSource(metadata) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("workflow graph update metadata is required");
  }
  return requireGraphUpdateSource(metadata.source);
}

function requireGraphUpdateSource(source) {
  if (graphUpdateSourceSet.has(source)) {
    return source;
  }
  throw new Error(`workflow graph update source is required: ${String(source)}`);
}

export function createGraphUpdateAccounting() {
  const sourceCounts = countersBySource();
  const edgeGraphicsRedrawCountsBySource = countersBySource();
  const edgeGraphicsRedrawSkipCountsBySource = countersBySource();
  const bySource = Object.fromEntries(
    graphUpdateSources.map((source) => [source, emptyGraphUpdateSourceStats()]),
  );
  const totals = emptyGraphUpdateSourceStats();
  let lastGraphUpdate = null;

  return {
    record: ({ cameraMoving, edgeRender, edgeUpdate, interactionCancelled, source }) => {
      const target = bySource[source];
      sourceCounts[source] += 1;
      target.graphUpdateCount += 1;
      totals.graphUpdateCount += 1;
      recordBooleanCount(cameraMoving, target, totals, "cameraMovingCount");
      recordBooleanCount(interactionCancelled, target, totals, "interactionCancelCount");
      addEdgeUpdateStats(target, edgeUpdate, edgeRender);
      addEdgeUpdateStats(totals, edgeUpdate, edgeRender);
      recordRedrawCount(edgeRender, source, {
        edgeGraphicsRedrawCountsBySource,
        edgeGraphicsRedrawSkipCountsBySource,
      });
      lastGraphUpdate = graphUpdateSnapshot({
        cameraMoving,
        edgeRender,
        edgeUpdate,
        interactionCancelled,
        source,
      });
    },
    snapshot: () => ({
      edgeGraphicsRedrawCountsBySource: { ...edgeGraphicsRedrawCountsBySource },
      edgeGraphicsRedrawSkipCountsBySource: { ...edgeGraphicsRedrawSkipCountsBySource },
      graphUpdateBySource: cloneGraphUpdateBySource(bySource),
      graphUpdateSourceCounts: { ...sourceCounts },
      lastGraphUpdate: lastGraphUpdate ? { ...lastGraphUpdate } : null,
      totals: { ...totals },
    }),
  };
}

function recordBooleanCount(value, target, totals, counter) {
  if (!value) {
    return;
  }
  target[counter] += 1;
  totals[counter] += 1;
}

function recordRedrawCount(
  edgeRender,
  source,
  { edgeGraphicsRedrawCountsBySource, edgeGraphicsRedrawSkipCountsBySource },
) {
  if (edgeRender.graphics.redrawn) {
    edgeGraphicsRedrawCountsBySource[source] += 1;
  }
  if (edgeRender.graphics.skipped) {
    edgeGraphicsRedrawSkipCountsBySource[source] += 1;
  }
}

function graphUpdateSnapshot({
  cameraMoving,
  edgeRender,
  edgeUpdate,
  interactionCancelled,
  source,
}) {
  return {
    cameraMoving,
    edgeAddCount: edgeUpdate.edgeAddCount,
    edgeEndpointUpdateCount: edgeUpdate.edgeEndpointUpdateCount,
    edgeGraphicsRedrawn: edgeRender.graphics.redrawn,
    edgeGraphicsSkipped: edgeRender.graphics.skipped,
    edgeLabelAddCount: edgeRender.labels.added,
    edgeLabelRemoveCount: edgeRender.labels.removed,
    edgeLabelRematerializeCount: edgeRender.labels.rematerialized,
    edgeLabelRetainCount: edgeRender.labels.retained,
    edgeLabelUpdateCount: edgeRender.labels.updated,
    edgeOrderUpdateCount: edgeUpdate.edgeOrderUpdateCount,
    edgeRemoveCount: edgeUpdate.edgeRemoveCount,
    edgeRematerializeCount: edgeRender.graphics.rematerialized,
    edgeRetainCount: edgeUpdate.edgeRetainCount,
    edgeStyleUpdateCount: edgeUpdate.edgeStyleUpdateCount,
    edgeTopologyUpdateCount: edgeUpdate.edgeTopologyUpdateCount,
    edgeUpdateCount: edgeUpdate.edgeUpdateCount,
    interactionCancelled,
    source,
  };
}

function addEdgeUpdateStats(target, edgeUpdate, edgeRender) {
  target.edgeAddCount += edgeUpdate.edgeAddCount;
  target.edgeEndpointUpdateCount += edgeUpdate.edgeEndpointUpdateCount;
  target.edgeGraphicsRematerializeCount += edgeRender.graphics.rematerialized;
  target.edgeLabelAddCount += edgeRender.labels.added;
  target.edgeLabelRemoveCount += edgeRender.labels.removed;
  target.edgeLabelRematerializeCount += edgeRender.labels.rematerialized;
  target.edgeLabelRetainCount += edgeRender.labels.retained;
  target.edgeLabelUpdateCount += edgeRender.labels.updated;
  target.edgeOrderUpdateCount += edgeUpdate.edgeOrderUpdateCount;
  target.edgeRemoveCount += edgeUpdate.edgeRemoveCount;
  target.edgeRetainCount += edgeUpdate.edgeRetainCount;
  target.edgeStyleUpdateCount += edgeUpdate.edgeStyleUpdateCount;
  target.edgeTopologyUpdateCount += edgeUpdate.edgeTopologyUpdateCount;
  target.edgeUpdateCount += edgeUpdate.edgeUpdateCount;
  if (edgeRender.graphics.redrawn) {
    target.edgeGraphicsRedrawCount += 1;
  }
  if (edgeRender.graphics.skipped) {
    target.edgeGraphicsRedrawSkipCount += 1;
  }
}

function countersBySource() {
  return Object.fromEntries(graphUpdateSources.map((source) => [source, 0]));
}

function cloneGraphUpdateBySource(bySource) {
  return Object.fromEntries(
    Object.entries(bySource).map(([source, value]) => [source, { ...value }]),
  );
}

function emptyGraphUpdateSourceStats() {
  return {
    cameraMovingCount: 0,
    edgeAddCount: 0,
    edgeEndpointUpdateCount: 0,
    edgeGraphicsRedrawCount: 0,
    edgeGraphicsRedrawSkipCount: 0,
    edgeGraphicsRematerializeCount: 0,
    edgeLabelAddCount: 0,
    edgeLabelRematerializeCount: 0,
    edgeLabelRemoveCount: 0,
    edgeLabelRetainCount: 0,
    edgeLabelUpdateCount: 0,
    edgeOrderUpdateCount: 0,
    edgeRemoveCount: 0,
    edgeRetainCount: 0,
    edgeStyleUpdateCount: 0,
    edgeTopologyUpdateCount: 0,
    edgeUpdateCount: 0,
    graphUpdateCount: 0,
    interactionCancelCount: 0,
  };
}
