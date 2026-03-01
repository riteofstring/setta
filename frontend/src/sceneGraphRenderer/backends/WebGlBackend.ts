import { CanvasSceneBackendBase } from "./CanvasSceneBackendBase";

export class WebGlBackend extends CanvasSceneBackendBase {
  protected getDebugLabel(): string {
    return "webgl";
  }
}
