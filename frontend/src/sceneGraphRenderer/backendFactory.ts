import { DomBackendAdapter } from "./backends/DomBackendAdapter";
import type { RendererBackend } from "./backends/RendererBackend";
import { WebGlBackend } from "./backends/WebGlBackend";
import { WebGpuBackend } from "./backends/WebGpuBackend";
import type { SceneGraphRendererResolvedBackend } from "./runtime";

export function createRendererBackend(
  backend: SceneGraphRendererResolvedBackend,
): RendererBackend {
  if (backend === "webgpu") {
    return new WebGpuBackend();
  }
  if (backend === "webgl") {
    return new WebGlBackend();
  }
  return new DomBackendAdapter();
}
