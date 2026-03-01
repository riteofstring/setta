import { CanvasSceneBackendBase } from "./CanvasSceneBackendBase";

export class WebGpuBackend extends CanvasSceneBackendBase {
  protected getDebugLabel(): string {
    return "webgpu";
  }
}
