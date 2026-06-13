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
  let edgeFlowRedrawCount = 0;
  let nodePulseRedrawCount = 0;
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
      cellAnimCount,
      edgeFlowRedrawCount,
      nodePulseRedrawCount,
      reduceMotion: settings.reduceMotion,
      transitionsActive,
    }),
    edgeFlows: () => activeEdgeFlows,
    glowNodes: () => activeGlowNodes,
    recompute: ({ edges, nodes, visibleNodeIds }) => {
      const animationsAllowed = settings.animationEnabled && !settings.reduceMotion;
      const visiblePulseNodes = nodes.filter(
        (node) =>
          visibleNodeIds.has(node.id) &&
          rendererNodeLayer(node) === "workflow" &&
          workflowPulseNodeStatuses.has(node.status),
      );
      const visibleActiveCells = nodes.filter(
        (node) =>
          visibleNodeIds.has(node.id) &&
          rendererNodeLayer(node) === "semantic" &&
          node.activity?.active === true,
      );
      activeGlowNodes = [...visiblePulseNodes, ...visibleActiveCells];
      if (!animationsAllowed) {
        activeEdgeFlows = [];
        activeEdgeFlowCount = 0;
        activeNodePulseCount = 0;
        animationActive = false;
        cellAnimCount = 0;
        transitionsActive = 0;
        return;
      }
      activeNodePulseCount = visiblePulseNodes.length;
      cellAnimCount = visibleActiveCells.length;
      activeEdgeFlows = edges.filter(
        (edge) =>
          rendererEdgeLayer(edge) === "workflow" &&
          edge.status === "active" &&
          visibleNodeIds.has(edge.sourceNodeId) &&
          visibleNodeIds.has(edge.targetNodeId),
      );
      activeEdgeFlowCount = activeEdgeFlows.length;
      transitionsActive = 0;
      animationActive =
        activeNodePulseCount > 0 ||
        activeEdgeFlowCount > 0 ||
        cellAnimCount > 0 ||
        transitionsActive > 0;
    },
    tick: (now, handlers = {}) => {
      if (!animationActive) {
        return false;
      }
      if (activeGlowNodes.length > 0) {
        nodePulseRedrawCount += 1;
        handlers.redrawNodeGlow?.({ nodes: activeGlowNodes, now });
      }
      if (activeEdgeFlowCount > 0) {
        edgeFlowRedrawCount += 1;
        handlers.redrawEdgeFlow?.({ edges: activeEdgeFlows, now });
      }
      return true;
    },
  };
}
