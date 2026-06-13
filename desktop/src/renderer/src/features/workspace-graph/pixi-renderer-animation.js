import { rendererEdgeLayer, rendererNodeLayer } from "./pixi-renderer-layers";

const workflowPulseNodeStatuses = new Set([
  "pending",
  "ready",
  "running",
  "waiting_approval",
  "failed",
  "recovery_required",
]);

export function createWorkflowGraphAnimationState({ animationEnabled, reduceMotion }) {
  const settings = {
    animationEnabled: animationEnabled !== false,
    reduceMotion: reduceMotion === true,
  };
  let animationActive = false;
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
    recompute: ({ edges, nodes, visibleNodeIds }) => {
      const animationsAllowed = settings.animationEnabled && !settings.reduceMotion;
      if (!animationsAllowed) {
        activeEdgeFlowCount = 0;
        activeNodePulseCount = 0;
        animationActive = false;
        cellAnimCount = 0;
        transitionsActive = 0;
        return;
      }
      activeNodePulseCount = nodes.filter(
        (node) =>
          visibleNodeIds.has(node.id) &&
          rendererNodeLayer(node) === "workflow" &&
          workflowPulseNodeStatuses.has(node.status),
      ).length;
      cellAnimCount = nodes.filter(
        (node) =>
          visibleNodeIds.has(node.id) &&
          rendererNodeLayer(node) === "semantic" &&
          node.activity?.active === true,
      ).length;
      activeEdgeFlowCount = edges.filter(
        (edge) =>
          rendererEdgeLayer(edge) === "workflow" &&
          edge.status === "active" &&
          visibleNodeIds.has(edge.sourceNodeId) &&
          visibleNodeIds.has(edge.targetNodeId),
      ).length;
      transitionsActive = 0;
      animationActive =
        activeNodePulseCount > 0 ||
        activeEdgeFlowCount > 0 ||
        cellAnimCount > 0 ||
        transitionsActive > 0;
    },
    tick: () => {
      if (!animationActive) {
        return;
      }
      if (activeEdgeFlowCount > 0) {
        edgeFlowRedrawCount += 1;
      }
      if (activeNodePulseCount > 0) {
        nodePulseRedrawCount += 1;
      }
    },
  };
}
