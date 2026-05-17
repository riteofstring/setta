export const GPU_FLOW_CLASS_NAMES = {
  controlsButton: "setta-gpu-flow__controls-button",
  controlsFitView: "setta-gpu-flow__controls-fit-view",
  controlsZoomIn: "setta-gpu-flow__controls-zoom-in",
  controlsZoomOut: "setta-gpu-flow__controls-zoom-out",
  handle: "setta-gpu-flow__handle",
  handleConnecting: "setta-gpu-flow__handle-connecting",
  handleValid: "setta-gpu-flow__handle-valid",
  minimap: "setta-gpu-flow__minimap",
  minimapMask: "setta-gpu-flow__minimap-mask",
  minimapNode: "setta-gpu-flow__minimap-node",
  node: "setta-gpu-flow__node",
  pane: "setta-gpu-flow__pane",
  panel: "setta-gpu-flow__panel",
  portalRoot: "setta-gpu-flow__portal-root",
  root: "setta-gpu-flow-root",
} as const;

export const GPU_FLOW_SELECTORS = {
  handle: `.${GPU_FLOW_CLASS_NAMES.handle}`,
  node: `.${GPU_FLOW_CLASS_NAMES.node}`,
  pane: `.${GPU_FLOW_CLASS_NAMES.pane}`,
  portalRoot: "[data-gpu-flow-portal-root='true']",
  root: `.${GPU_FLOW_CLASS_NAMES.root}`,
} as const;

export function getGpuFlowHandlePositionClass(position: string): string {
  return `${GPU_FLOW_CLASS_NAMES.handle}-${position}`;
}
