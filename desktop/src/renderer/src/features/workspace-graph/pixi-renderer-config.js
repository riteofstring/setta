import { initialEdges, initialNodes } from "./pixi-renderer-fixture";
import { noopCameraStateChange, noopReactRenderCount } from "./pixi-renderer-handlers";

export const backgroundColor = 0x07080d;
export const maxZoom = 4;
export const minZoom = 0.25;
// A pointer that moves more than this many screen pixels after pressing on an activity chip is
// treated as the start of a camera pan rather than a chip click, so chips never create pan dead
// zones over the canvas.
export const activityChipClickMoveThresholdScreen = 6;
export const nodeOpenClickDistanceScreen = 6;
export const nodeOpenClickIntervalMs = 500;
export const portHitRadiusScreen = 18;

const defaultRendererOptions = {
  debugSurfaceId: "workflow-graph",
  graph: { edges: initialEdges, nodes: initialNodes },
  initialCameraState: null,
  onActivityChipOpen: null,
  onCameraStateChange: noopCameraStateChange,
  onCanvasContextMenu: null,
  onNodeOpen: null,
  onNodePositionsChange: null,
  onNodeSelectionChange: null,
  reactRenderCount: noopReactRenderCount,
};

export function rendererOptionsWithDefaults(options) {
  return {
    ...defaultRendererOptions,
    ...definedRendererOptions(options),
  };
}

function definedRendererOptions(options) {
  const definedOptions = {};
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      definedOptions[key] = value;
    }
  }
  return definedOptions;
}
