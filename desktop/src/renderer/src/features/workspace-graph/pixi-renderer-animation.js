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
    recompute: ({ edges, nodes, visibleNodeIds }) => {
      const animationsAllowed = settings.animationEnabled && !settings.reduceMotion;
      const visiblePulseNodes = nodes.filter(
        (node) =>
          visibleNodeIds.has(node.id) &&
          rendererNodeLayer(node) === "workflow" &&
          workflowPulseNodeStatuses.has(node.status),
      );
      const visibleActiveCellCandidates = nodes.filter(
        (node) =>
          visibleNodeIds.has(node.id) &&
          rendererNodeLayer(node) === "semantic" &&
          node.activity?.active === true,
      );
      cellAnimCandidateCount = visibleActiveCellCandidates.length;
      const cellCap = workspaceNeonTheme.semantic.animation.activeCellCap;
      const visibleActiveCells = visibleActiveCellCandidates.slice(0, cellCap);
      cellAnimCapped = visibleActiveCellCandidates.length > visibleActiveCells.length;
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
      activeCellNodes = visibleActiveCells;
      activeSemanticNodeIds = new Set(activeCellNodes.map((node) => node.id));
      cellAnimCount = visibleActiveCells.length;
      activeEdgeFlows = edges.filter(
        (edge) =>
          rendererEdgeLayer(edge) === "workflow" &&
          edge.status === "active" &&
          visibleNodeIds.has(edge.sourceNodeId) &&
          visibleNodeIds.has(edge.targetNodeId),
      );
      activeEdgeFlowCount = activeEdgeFlows.length;
      const semanticTendrilCandidates =
        activeSemanticNodeIds.size === 0
          ? []
          : edges.filter(
              (edge) =>
                rendererEdgeLayer(edge) === "semantic" &&
                visibleNodeIds.has(edge.sourceNodeId) &&
                visibleNodeIds.has(edge.targetNodeId) &&
                (activeSemanticNodeIds.has(edge.sourceNodeId) ||
                  activeSemanticNodeIds.has(edge.targetNodeId)),
            );
      semanticTendrilAnimCandidateCount = semanticTendrilCandidates.length;
      const tendrilCap = workspaceNeonTheme.semantic.animation.activeTendrilCap;
      activeSemanticTendrils = semanticTendrilCandidates.slice(0, tendrilCap);
      semanticTendrilAnimCapped = semanticTendrilCandidates.length > activeSemanticTendrils.length;
      semanticTendrilAnimCount = activeSemanticTendrils.length;
      transitionsActive = 0;
      animationActive =
        activeNodePulseCount > 0 ||
        activeEdgeFlowCount > 0 ||
        cellAnimCount > 0 ||
        semanticTendrilAnimCount > 0 ||
        transitionsActive > 0;
    },
    tick: (now, handlers = {}) => {
      if (!animationActive) {
        return false;
      }
      redrawActiveNodeGlow(handlers, now);
      redrawActiveEdgeFlow(handlers, now);
      redrawActiveCells(handlers, now);
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

  function redrawActiveEdgeFlow(handlers, now) {
    if (activeEdgeFlowCount === 0 && semanticTendrilAnimCount === 0) {
      return;
    }
    edgeFlowRedrawCount += 1;
    if (semanticTendrilAnimCount > 0) {
      semanticTendrilRedrawCount += 1;
    }
    handlers.redrawEdgeFlow?.({
      activeSemanticNodeIds,
      edges: [...activeEdgeFlows, ...activeSemanticTendrils],
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
