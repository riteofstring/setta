export const GPU_FLOW_CLASS_NAMES = {
  canvas: "setta-gpu-flow__canvas",
  container: "setta-gpu-flow__container",
  controlsButton: "setta-gpu-flow__controls-button",
  controlsFitView: "setta-gpu-flow__controls-fit-view",
  controlsZoomIn: "setta-gpu-flow__controls-zoom-in",
  controlsZoomOut: "setta-gpu-flow__controls-zoom-out",
  edge: "setta-gpu-flow__edge",
  edges: "setta-gpu-flow__edges",
  handle: "setta-gpu-flow__handle",
  handleConnecting: "setta-gpu-flow__handle-connecting",
  handleValid: "setta-gpu-flow__handle-valid",
  minimap: "setta-gpu-flow__minimap",
  minimapMask: "setta-gpu-flow__minimap-mask",
  minimapNode: "setta-gpu-flow__minimap-node",
  node: "setta-gpu-flow__node",
  nodes: "setta-gpu-flow__nodes",
  pane: "setta-gpu-flow__pane",
  panel: "setta-gpu-flow__panel",
  portalRoot: "setta-gpu-flow__portal-root",
  root: "setta-gpu-flow-root",
  viewport: "setta-gpu-flow__canvas",
} as const;

export const GPU_FLOW_SELECTORS = {
  canvas: `.${GPU_FLOW_CLASS_NAMES.canvas}`,
  handle: `.${GPU_FLOW_CLASS_NAMES.handle}`,
  node: `.${GPU_FLOW_CLASS_NAMES.node}`,
  pane: `.${GPU_FLOW_CLASS_NAMES.pane}`,
  portalRoot: "[data-gpu-flow-portal-root='true']",
  root: `.${GPU_FLOW_CLASS_NAMES.root}`,
} as const;

export function getGpuFlowHandlePositionClass(position: string): string {
  return `${GPU_FLOW_CLASS_NAMES.handle}-${position}`;
}
