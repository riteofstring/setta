import { noopCameraStateChange, noopReactRenderCount } from "./pixi-renderer-handlers";

const defaultRendererOptions = {
  animationEnabled: true,
  debugSurfaceId: "workflow-graph",
  initialCameraState: null,
  onActivitySpriteClick: null,
  onCameraStateChange: noopCameraStateChange,
  onCanvasContextMenu: null,
  onNodeOpen: null,
  onNodePositionsChange: null,
  onNodeSelectionChange: null,
  reactRenderCount: noopReactRenderCount,
  reduceMotion: false,
};

export const workflowGraphRendererLimits = {
  maxZoom: 4,
  minZoom: 0.25,
  nodeOpenClickDistanceScreen: 6,
  nodeOpenClickIntervalMs: 500,
  portHitRadiusScreen: 18,
};

export function rendererOptionsWithDefaults(options) {
  const mergedOptions = {
    ...defaultRendererOptions,
    ...definedRendererOptions(options),
  };
  if (!mergedOptions.graph) {
    throw new Error("Workflow graph renderer creation requires a controller-supplied graph");
  }
  return mergedOptions;
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
