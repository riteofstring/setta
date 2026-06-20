import { rendererEdgeLayer, rendererNodeLayer } from "./pixi-renderer-layers";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const workflowPulseNodeStatuses = new Set(
  Object.entries(workspaceNeonTheme.workflow.nodeAura)
    .filter(([, style]) => style.animate)
    .map(([status]) => status),
);

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
  let cellAnimCount = 0;
  let transitionsActive = 0;
  let activeEdgeFlowCount = 0;
  let activeNodePulseCount = 0;

  return {
    debugSnapshot: () => ({
      activeEdgeFlowCount,
      activeNodePulseCount,
      animationActive,
      animationEnabled: settings.animationEnabled,
      cellAnimCandidateCount,
      cellAnimCap: workspaceNeonTheme.semantic.animation.activeCellCap,
      cellAnimCapped,
      cellAnimCount,
      cellAnimRedrawCount,
      edgeFlowRedrawCount,
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
      cellAnimCandidateCount = visibleActiveCellCandidates.length;
      cellAnimCapped = false;
      activeGlowNodes = visiblePulseNodes;
      if (!animationsAllowed) {
        activeEdgeFlows = [];
        activeCellNodes = [];
        activeSemanticNodeIds = new Set();
        activeSemanticTendrils = [];
        activeEdgeFlowCount = 0;
        activeNodePulseCount = 0;
        animationActive = false;
        cellAnimCount = 0;
        semanticTendrilAnimCandidateCount = 0;
        semanticTendrilAnimCapped = false;
        semanticTendrilAnimCount = 0;
        transitionsActive = 0;
        return;
      }
      activeNodePulseCount = visiblePulseNodes.length;
      activeCellNodes = [];
      activeSemanticNodeIds = new Set();
      cellAnimCount = 0;
      activeEdgeFlows = edges.filter(
        (edge) =>
          rendererEdgeLayer(edge) === "workflow" &&
          edge.status === "active" &&
          visibleNodeIds.has(edge.sourceNodeId) &&
          visibleNodeIds.has(edge.targetNodeId),
      );
      activeEdgeFlowCount = activeEdgeFlows.length;
      activeSemanticTendrils = [];
      semanticTendrilAnimCandidateCount = 0;
      semanticTendrilAnimCapped = false;
      semanticTendrilAnimCount = 0;
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
}
