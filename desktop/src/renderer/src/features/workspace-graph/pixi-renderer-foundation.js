import { hostScreenSize } from "./pixi-renderer-helpers";
import {
  createWorkspaceBackdropGradient,
  drawWorkspaceBackdrop,
  drawWorkspaceGrid,
} from "./pixi-renderer-node-geometry";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const activeWorkflowEdgeStatuses = new Set(["active"]);
const activeWorkflowNodeStatuses = new Set(["pending", "ready", "running"]);

export function foundationStyleForGraph(graph) {
  if (graph.nodes.some((node) => node.layer === "semantic")) {
    return workspaceNeonTheme.foundation;
  }
  return hasActiveWorkflowState(graph)
    ? workspaceNeonTheme.foundation.workflowActive
    : workspaceNeonTheme.foundation.workflowOnly;
}

function hasActiveWorkflowState(graph) {
  return (
    graph.nodes.some(
      (node) => node.layer === "workflow" && activeWorkflowNodeStatuses.has(node.status),
    ) ||
    graph.edges.some(
      (edge) => edge.layer === "workflow" && activeWorkflowEdgeStatuses.has(edge.status),
    )
  );
}

export function syncRendererFoundationStyle({
  app,
  backdrop,
  backdropGradient,
  foundationStyle,
  grid,
  host,
  nextGraph,
}) {
  const nextFoundationStyle = foundationStyleForGraph(nextGraph);
  if (nextFoundationStyle === foundationStyle) {
    return {
      backgroundColor: foundationStyle.background,
      backdropGradient,
      changed: false,
      foundationStyle,
    };
  }
  const nextBackdropGradient = createWorkspaceBackdropGradient(nextFoundationStyle);
  app.renderer.background.color = nextFoundationStyle.background;
  backdropGradient.destroy();
  drawWorkspaceBackdrop(backdrop, hostScreenSize(host), nextFoundationStyle);
  drawWorkspaceGrid(grid, nextFoundationStyle);
  return {
    backgroundColor: nextFoundationStyle.background,
    backdropGradient: nextBackdropGradient,
    changed: true,
    foundationStyle: nextFoundationStyle,
  };
}
