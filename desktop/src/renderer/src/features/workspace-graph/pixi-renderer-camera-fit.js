import { cameraState, clamp, hostScreenSize } from "./pixi-renderer-helpers";
import { rendererNodeLayer } from "./pixi-renderer-layers";
import { workspaceNeonTheme } from "./workspace-neon-theme";

export function fitViewportToGraph({
  animationCoordinator,
  commitCameraChange,
  host,
  labels,
  maxFitZoom = 1.15,
  maxZoom,
  minZoom,
  nodes,
  paddingScreenPx = 160,
  viewport,
}) {
  if (nodes.length === 0) {
    return cameraState(viewport);
  }
  const bounds = graphNodeBounds(nodes);
  const screen = hostScreenSize(host);
  const availableWidth = Math.max(1, screen.width - paddingScreenPx);
  const availableHeight = Math.max(1, screen.height - paddingScreenPx);
  const fitZoom = Math.min(
    availableWidth / Math.max(1, bounds.width),
    availableHeight / Math.max(1, bounds.height),
    effectiveMaxFitZoom(nodes, maxFitZoom),
  );
  viewport.setZoom(clamp(fitZoom, minZoom, maxZoom));
  viewport.moveCenter(bounds.centerX, bounds.centerY);
  commitCameraChange();
  labels.syncAllLabels();
  animationCoordinator.syncActiveSet();
  return cameraState(viewport);
}

function effectiveMaxFitZoom(nodes, requestedMaxFitZoom) {
  const hasSemanticNode = nodes.some((node) => rendererNodeLayer(node) === "semantic");
  const hasWorkflowNode = nodes.some((node) => rendererNodeLayer(node) === "workflow");
  if (hasSemanticNode && !hasWorkflowNode) {
    // Semantic-only maps keep cells at true-size or smaller on auto-fit; manual zoom remains free.
    return Math.min(requestedMaxFitZoom, workspaceNeonTheme.semantic.fit.semanticOnlyMaxZoom);
  }
  return requestedMaxFitZoom;
}

function graphNodeBounds(nodes) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    centerX: minX + width / 2,
    centerY: minY + height / 2,
    height,
    width,
  };
}
