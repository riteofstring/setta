import { workspaceNeonTheme } from "./workspace-neon-theme";

export function workflowCardLayoutFor(node) {
  const { compact, regular } = workspaceNeonTheme.workflow.cardLayout;
  return node.height < compact.maxHeight ? compact : regular;
}

export function workflowCardLabelCenterX(node) {
  const layout = workflowCardLayoutFor(node);
  if ("labelCenterX" in layout) {
    return layout.labelCenterX;
  }
  const ratioCenter = node.width * layout.labelCenterRatio;
  const rightBound = node.width - layout.labelRightPadding;
  return Math.min(rightBound, Math.max(layout.labelMinCenterX, ratioCenter));
}
