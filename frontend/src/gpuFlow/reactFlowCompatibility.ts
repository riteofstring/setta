// GPU flow owns this narrow ReactFlow-compatible class surface so existing
// project CSS, browser tests, and user automation selectors keep working while
// runtime behavior stays Setta-owned. Do not expand it without an owner decision.
export const REACT_FLOW_COMPAT_CLASS_NAMES = {
  controlsButton: "react-flow__controls-button",
  controlsFitView: "react-flow__controls-fitview",
  controlsZoomIn: "react-flow__controls-zoomin",
  controlsZoomOut: "react-flow__controls-zoomout",
  edgeUpdater: "react-flow__edgeupdater",
  handle: "react-flow__handle",
  handleConnecting: "react-flow__handle-connecting",
  handleValid: "react-flow__handle-valid",
  minimap: "react-flow__minimap",
  minimapMask: "react-flow__minimap-mask",
  minimapNode: "react-flow__minimap-node",
  node: "react-flow__node",
  pane: "react-flow__pane",
  panel: "react-flow__panel",
  root: "react-flow",
  selection: "react-flow__selection",
  nodesSelection: "react-flow__nodesselection",
  nodesSelectionRect: "react-flow__nodesselection-rect",
  container: "react-flow__container",
} as const;

export const REACT_FLOW_COMPAT_SELECTORS = {
  edgeUpdater: `.${REACT_FLOW_COMPAT_CLASS_NAMES.edgeUpdater}`,
  handle: `.${REACT_FLOW_COMPAT_CLASS_NAMES.handle}`,
  node: `.${REACT_FLOW_COMPAT_CLASS_NAMES.node}`,
  pane: `.${REACT_FLOW_COMPAT_CLASS_NAMES.pane}`,
  root: `.${REACT_FLOW_COMPAT_CLASS_NAMES.root}`,
  selection: `.${REACT_FLOW_COMPAT_CLASS_NAMES.selection}`,
  nodesSelectionRect: `.${REACT_FLOW_COMPAT_CLASS_NAMES.nodesSelectionRect}`,
} as const;

export function getReactFlowCompatibleEdgeUpdaterEndpointClass(
  endpoint: string,
): string {
  return `${REACT_FLOW_COMPAT_CLASS_NAMES.edgeUpdater}-${endpoint}`;
}

export function getReactFlowCompatibleHandlePositionClass(
  position: string,
): string {
  return `${REACT_FLOW_COMPAT_CLASS_NAMES.handle}-${position}`;
}
