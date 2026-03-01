import type { SceneGraphRendererCapabilities } from "sceneGraphRenderer/capabilities";
import type {
  SceneGraphCamera,
  SceneGraphFrameState,
  SceneGraphRenderSnapshot,
  SceneGraphRenderSnapshotDiff,
  SceneGraphResourceCacheStats,
} from "sceneGraphRenderer/types";
import type { RendererBackend } from "./RendererBackend";

// Phase 1 keeps the existing DOM renderer as interaction/source-of-truth path.
// This adapter satisfies the new backend contract without mutating DOM behavior.
export class DomBackendAdapter implements RendererBackend {
  private readonly resourceCacheStats: SceneGraphResourceCacheStats = {
    sectionCacheSize: 0,
    edgeCacheSize: 0,
    sectionCacheCapacity: 0,
    edgeCacheCapacity: 0,
    sectionEvictions: 0,
    edgeEvictions: 0,
    totalEvictions: 0,
    pressure: 0,
  };

  init(
    _canvas: HTMLCanvasElement,
    _capabilities: SceneGraphRendererCapabilities,
  ): void {}

  updateResources(_diff: SceneGraphRenderSnapshotDiff): void {}

  render(
    _snapshot: SceneGraphRenderSnapshot,
    _camera: SceneGraphCamera,
    _frameState: SceneGraphFrameState,
  ): void {}

  getResourceCacheStats(): SceneGraphResourceCacheStats {
    return this.resourceCacheStats;
  }

  dispose(): void {}
}
