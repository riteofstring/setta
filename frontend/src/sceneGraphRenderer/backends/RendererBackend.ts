import type { SceneGraphRendererCapabilities } from "sceneGraphRenderer/capabilities";
import type {
  SceneGraphCamera,
  SceneGraphFrameState,
  SceneGraphRenderSnapshot,
  SceneGraphRenderSnapshotDiff,
  SceneGraphResourceCacheStats,
} from "sceneGraphRenderer/types";

export interface RendererBackend {
  init: (
    canvas: HTMLCanvasElement,
    capabilities: SceneGraphRendererCapabilities,
  ) => void;
  updateResources: (diff: SceneGraphRenderSnapshotDiff) => void;
  render: (
    snapshot: SceneGraphRenderSnapshot,
    camera: SceneGraphCamera,
    frameState: SceneGraphFrameState,
  ) => void;
  getResourceCacheStats: () => SceneGraphResourceCacheStats;
  dispose: () => void;
}
