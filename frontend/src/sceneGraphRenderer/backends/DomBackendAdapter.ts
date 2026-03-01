import type { SceneGraphRendererCapabilities } from "sceneGraphRenderer/capabilities";
import type {
  SceneGraphCamera,
  SceneGraphFrameState,
  SceneGraphRenderSnapshot,
  SceneGraphRenderSnapshotDiff,
} from "sceneGraphRenderer/types";
import type { RendererBackend } from "./RendererBackend";

// Phase 1 keeps the existing DOM renderer as interaction/source-of-truth path.
// This adapter satisfies the new backend contract without mutating DOM behavior.
export class DomBackendAdapter implements RendererBackend {
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

  dispose(): void {}
}
