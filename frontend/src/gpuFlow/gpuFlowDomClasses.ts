export const GPU_FLOW_CLASS_NAMES = {
  canvas: "setta-gpu-flow__canvas",
  container: "setta-gpu-flow__container",
  controlsButton: "setta-gpu-flow__controls-button",
  controlsFitView: "setta-gpu-flow__controls-fit-view",
  controlsZoomIn: "setta-gpu-flow__controls-zoom-in",
  controlsZoomOut: "setta-gpu-flow__controls-zoom-out",
  edge: "setta-gpu-flow__edge",
  edgeUpdater: "setta-gpu-flow__edge-updater",
  edges: "setta-gpu-flow__edges",
  handle: "setta-gpu-flow__handle",
  handleConnecting: "setta-gpu-flow__handle-connecting",
  handleValid: "setta-gpu-flow__handle-valid",
  minimap: "setta-gpu-flow__minimap",
  minimapMask: "setta-gpu-flow__minimap-mask",
  minimapNode: "setta-gpu-flow__minimap-node",
  node: "setta-gpu-flow__node",
  nodes: "setta-gpu-flow__nodes",
  nodesSelection: "setta-gpu-flow__nodes-selection",
  nodesSelectionRect: "setta-gpu-flow__nodes-selection-rect",
  pane: "setta-gpu-flow__pane",
  panel: "setta-gpu-flow__panel",
  root: "setta-gpu-flow-root",
  selection: "setta-gpu-flow__selection",
  viewport: "setta-gpu-flow__canvas",
} as const;

export const GPU_FLOW_SELECTORS = {
  canvas: `.${GPU_FLOW_CLASS_NAMES.canvas}`,
  edgeUpdater: `.${GPU_FLOW_CLASS_NAMES.edgeUpdater}`,
  handle: `.${GPU_FLOW_CLASS_NAMES.handle}`,
  node: `.${GPU_FLOW_CLASS_NAMES.node}`,
  nodesSelectionRect: `.${GPU_FLOW_CLASS_NAMES.nodesSelectionRect}`,
  pane: `.${GPU_FLOW_CLASS_NAMES.pane}`,
  root: `.${GPU_FLOW_CLASS_NAMES.root}`,
  selection: `.${GPU_FLOW_CLASS_NAMES.selection}`,
} as const;

export function getGpuFlowEdgeUpdaterEndpointClass(endpoint: string): string {
  return `${GPU_FLOW_CLASS_NAMES.edgeUpdater}-${endpoint}`;
}

export function getGpuFlowHandlePositionClass(position: string): string {
  return `${GPU_FLOW_CLASS_NAMES.handle}-${position}`;
}
