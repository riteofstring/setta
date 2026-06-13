import { initialEdges, initialNodes } from "./pixi-renderer-fixture";
import { noopCameraStateChange, noopReactRenderCount } from "./pixi-renderer-handlers";

const defaultRendererOptions = {
  animationEnabled: true,
  debugSurfaceId: "workflow-graph",
  graph: { edges: initialEdges, nodes: initialNodes },
  initialCameraState: null,
  onCameraStateChange: noopCameraStateChange,
  onCanvasContextMenu: null,
  onNodeOpen: null,
  onNodePositionsChange: null,
  onNodeSelectionChange: null,
  reactRenderCount: noopReactRenderCount,
  reduceMotion: false,
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
