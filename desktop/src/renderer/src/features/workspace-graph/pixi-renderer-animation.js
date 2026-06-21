import { rendererEdgeLayer, rendererNodeLayer } from "./pixi-renderer-layers";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const workflowPulseNodeStatuses = new Set(
  Object.entries(workspaceNeonTheme.workflow.nodeAura)
    .filter(([, style]) => style.animate)
    .map(([status]) => status),
);

const animationLayerIds = {
  cameraCritical: "camera-critical",
  decorative: "decorative",
  semanticState: "semantic state",
  trajectoryLiveness: "trajectory/liveness",
};

export const workflowGraphAnimationInventory = Object.freeze([
  Object.freeze({
    allowedDuringCameraMotion: true,
    budget: Object.freeze({ maxFrameMs: 1 }),
    classification: animationLayerIds.cameraCritical,
    defaultEnabled: true,
    id: "camera-transform",
    stateMeaning: "camera pan/zoom transform",
  }),
  Object.freeze({
    allowedDuringCameraMotion: true,
    budget: Object.freeze({ maxFrameMs: 2, maxItems: "visible-workflow-node-window" }),
    classification: animationLayerIds.trajectoryLiveness,
    defaultEnabled: true,
    id: "workflow-node-pulse",
    stateMeaning: "workflow node is pending, ready, running, failed, waiting, or recovering",
  }),
  Object.freeze({
    allowedDuringCameraMotion: true,
    budget: Object.freeze({ maxFrameMs: 2, maxItems: "visible-active-workflow-edge-window" }),
    classification: animationLayerIds.trajectoryLiveness,
    defaultEnabled: true,
    id: "workflow-edge-flow",
    stateMeaning: "workflow edge is actively carrying work",
  }),
  Object.freeze({
    allowedDuringCameraMotion: true,
    budget: Object.freeze({ maxFrameMs: 2, maxItems: "trajectory-store-visible-sprite-caps" }),
    classification: animationLayerIds.trajectoryLiveness,
    defaultEnabled: true,
    id: "trajectory-runtime-sprites",
    stateMeaning:
      "recent runtime/tool/file/test activity attached to a workflow node or recent lane",
  }),
  Object.freeze({
    allowedDuringCameraMotion: true,
    budget: Object.freeze({ maxFrameMs: 0.5, maxItems: "visible-semantic-activity-markers" }),
    classification: animationLayerIds.semanticState,
    defaultEnabled: true,
    id: "semantic-activity-marker",
    stateMeaning: "semantic node has current or recent named activity",
  }),
  Object.freeze({
    allowedDuringCameraMotion: false,
    budget: Object.freeze({ maxFrameMs: 0, maxItems: 0 }),
    classification: animationLayerIds.decorative,
    defaultEnabled: false,
    id: "semantic-cell-breath",
    stateMeaning: null,
  }),
  Object.freeze({
    allowedDuringCameraMotion: false,
    budget: Object.freeze({ maxFrameMs: 0, maxItems: 0 }),
    classification: animationLayerIds.decorative,
    defaultEnabled: false,
    id: "semantic-tendril-flow",
    stateMeaning: null,
  }),
]);

const emptyAnimationWorkByLayer = Object.freeze({
  [animationLayerIds.cameraCritical]: 0,
  [animationLayerIds.decorative]: 0,
  [animationLayerIds.semanticState]: 0,
  [animationLayerIds.trajectoryLiveness]: 0,
});

export function createWorkflowGraphAnimationState({ animationEnabled, reduceMotion }) {
  const settings = {
    animationEnabled: animationEnabled !== false,
    reduceMotion: reduceMotion === true,
  };
  let animationActive = false;
  let activeGlowNodes = [];
  let activeEdgeFlows = [];
  let activeCellNodes = [];
  let activeSemanticNodeIds = new Set();
  let activeSemanticTendrils = [];
  let cellAnimCandidateCount = 0;
  let cellAnimCapped = false;
  let cellAnimRedrawCount = 0;
  let edgeFlowRedrawCount = 0;
  let nodePulseRedrawCount = 0;
  let semanticTendrilAnimCandidateCount = 0;
  let semanticTendrilAnimCapped = false;
  let semanticTendrilAnimCount = 0;
  let semanticTendrilRedrawCount = 0;
  let decorativeAnimationDroppedCount = 0;
  let lastDecorativeAnimationDroppedCount = 0;
  let livenessAnimationDroppedCount = 0;
  let lastLivenessAnimationDroppedCount = 0;
  let cellAnimCount = 0;
  let transitionsActive = 0;
  let activeEdgeFlowCount = 0;
  let activeNodePulseCount = 0;

  return {
    debugSnapshot: () => ({
      activeEdgeFlowCount,
      activeNodePulseCount,
      animationDroppedWorkByLayer: animationWorkByLayer({
        decorative: decorativeAnimationDroppedCount,
        trajectoryLiveness: livenessAnimationDroppedCount,
      }),
      animationActive,
      animationEnabled: settings.animationEnabled,
      animationInventory: workflowGraphAnimationInventory,
      animationLastDroppedWorkByLayer: animationWorkByLayer({
        decorative: lastDecorativeAnimationDroppedCount,
        trajectoryLiveness: lastLivenessAnimationDroppedCount,
      }),
      cellAnimCandidateCount,
      cellAnimCap: workspaceNeonTheme.semantic.animation.activeCellCap,
      cellAnimCapped,
      cellAnimCount,
      cellAnimRedrawCount,
      decorativeAnimationDroppedCount,
      edgeFlowRedrawCount,
      lastDecorativeAnimationDroppedCount,
      lastLivenessAnimationDroppedCount,
      nodePulseRedrawCount,
      reduceMotion: settings.reduceMotion,
      semanticTendrilAnimCandidateCount,
      semanticTendrilAnimCap: workspaceNeonTheme.semantic.animation.activeTendrilCap,
      semanticTendrilAnimCapped,
      semanticTendrilAnimCount,
      semanticTendrilRedrawCount,
      transitionsActive,
    }),
    activeSemanticNodeIds: () => activeSemanticNodeIds,
    cellNodes: () => activeCellNodes,
    edgeFlows: () => [...activeEdgeFlows, ...activeSemanticTendrils],
    glowNodes: () => activeGlowNodes,
    recompute: ({ edges, visibleNodeIds, visibleNodes }) => {
      const animationsAllowed = settings.animationEnabled && !settings.reduceMotion;
      const visiblePulseNodes = visibleNodes.filter(
        (node) =>
          rendererNodeLayer(node) === "workflow" && workflowPulseNodeStatuses.has(node.status),
      );
      const visibleActiveCellCandidates = visibleNodes.filter(
        (node) => rendererNodeLayer(node) === "semantic" && node.activity?.active === true,
      );
      const visibleActiveWorkflowEdgeCandidates = activeWorkflowEdges({
        edges,
        visibleNodeIds,
      });
      cellAnimCandidateCount = visibleActiveCellCandidates.length;
      cellAnimCapped = false;
      activeGlowNodes = visiblePulseNodes;
      semanticTendrilAnimCandidateCount = countDecorativeSemanticTendrilCandidates({
        edges,
        visibleActiveCellCandidates,
        visibleNodes,
        visibleNodeIds,
      });
      semanticTendrilAnimCapped = false;
      semanticTendrilAnimCount = 0;
      activeSemanticTendrils = [];
      activeSemanticNodeIds = new Set();
      activeCellNodes = [];
      cellAnimCount = 0;
      recordDroppedDecorativeAnimation();
      if (!animationsAllowed) {
        activeEdgeFlows = [];
        activeEdgeFlowCount = 0;
        activeNodePulseCount = 0;
        animationActive = false;
        transitionsActive = 0;
        recordDroppedLivenessAnimation(
          visiblePulseNodes.length + visibleActiveWorkflowEdgeCandidates.length,
        );
        return;
      }
      activeNodePulseCount = visiblePulseNodes.length;
      activeEdgeFlows = visibleActiveWorkflowEdgeCandidates;
      activeEdgeFlowCount = activeEdgeFlows.length;
      recordDroppedLivenessAnimation(0);
      transitionsActive = 0;
      animationActive =
        activeNodePulseCount > 0 || activeEdgeFlowCount > 0 || transitionsActive > 0;
    },
    tick: (now, handlers = {}, { cameraMotion = "settled" } = {}) => {
      if (!animationActive) {
        return false;
      }
      redrawActiveNodeGlow(handlers, now);
      redrawActiveEdgeFlow(handlers, now, {
        includeSemanticTendrils: cameraMotion !== "moving",
      });
      if (cameraMotion !== "moving") {
        redrawActiveCells(handlers, now);
      }
      return true;
    },
  };

  function redrawActiveNodeGlow(handlers, now) {
    if (activeGlowNodes.length === 0) {
      return;
    }
    nodePulseRedrawCount += 1;
    handlers.redrawNodeGlow?.({ nodes: activeGlowNodes, now });
  }

  function redrawActiveEdgeFlow(handlers, now, { includeSemanticTendrils }) {
    const semanticEdges = includeSemanticTendrils ? activeSemanticTendrils : [];
    const edges = [...activeEdgeFlows, ...semanticEdges];
    const clearsDeferredSemanticTendrils = !includeSemanticTendrils && semanticTendrilAnimCount > 0;
    if (edges.length === 0 && !clearsDeferredSemanticTendrils) {
      return;
    }
    edgeFlowRedrawCount += 1;
    if (semanticEdges.length > 0) {
      semanticTendrilRedrawCount += 1;
    }
    handlers.redrawEdgeFlow?.({
      activeSemanticNodeIds: includeSemanticTendrils ? activeSemanticNodeIds : new Set(),
      edges,
      now,
    });
  }

  function redrawActiveCells(handlers, now) {
    if (cellAnimCount === 0) {
      return;
    }
    cellAnimRedrawCount += 1;
    handlers.redrawCellAnimation?.({ nodes: activeCellNodes, now });
  }

  function recordDroppedDecorativeAnimation() {
    lastDecorativeAnimationDroppedCount =
      cellAnimCandidateCount + semanticTendrilAnimCandidateCount;
    decorativeAnimationDroppedCount += lastDecorativeAnimationDroppedCount;
  }

  function recordDroppedLivenessAnimation(count) {
    lastLivenessAnimationDroppedCount = count;
    livenessAnimationDroppedCount += count;
  }
}

function animationWorkByLayer({ decorative, trajectoryLiveness }) {
  return {
    ...emptyAnimationWorkByLayer,
    [animationLayerIds.decorative]: decorative,
    [animationLayerIds.trajectoryLiveness]: trajectoryLiveness,
  };
}

function activeWorkflowEdges({ edges, visibleNodeIds }) {
  return edges.filter(
    (edge) =>
      rendererEdgeLayer(edge) === "workflow" &&
      edge.status === "active" &&
      visibleNodeIds.has(edge.sourceNodeId) &&
      visibleNodeIds.has(edge.targetNodeId),
  );
}

function countDecorativeSemanticTendrilCandidates({
  edges,
  visibleActiveCellCandidates,
  visibleNodes,
  visibleNodeIds,
}) {
  if (visibleActiveCellCandidates.length === 0) {
    return 0;
  }
  const activeSemanticNodeIds = new Set(visibleActiveCellCandidates.map((node) => node.id));
  const visibleSemanticNodeIds = new Set(
    visibleNodes.filter((node) => rendererNodeLayer(node) === "semantic").map((node) => node.id),
  );
  let count = 0;
  for (const edge of edges) {
    if (
      isDecorativeSemanticTendrilCandidate(edge, {
        activeSemanticNodeIds,
        visibleNodeIds,
        visibleSemanticNodeIds,
      })
    ) {
      count += 1;
    }
  }
  return count;
}

function isDecorativeSemanticTendrilCandidate(
  edge,
  { activeSemanticNodeIds, visibleNodeIds, visibleSemanticNodeIds },
) {
  return (
    rendererEdgeLayer(edge) === "semantic" &&
    edgeEndpointsInSet(edge, visibleSemanticNodeIds) &&
    edgeEndpointsInSet(edge, visibleNodeIds) &&
    edgeTouchesSet(edge, activeSemanticNodeIds)
  );
}

function edgeEndpointsInSet(edge, ids) {
  return ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId);
}

function edgeTouchesSet(edge, ids) {
  return ids.has(edge.sourceNodeId) || ids.has(edge.targetNodeId);
}
