import type {
  GpuPoint,
  GpuViewport,
  GpuViewportInput,
  GpuViewportTuple,
} from "./viewportMath";
import type { GpuFlowViewportStoreApi } from "./viewportStore";

export type GpuViewportRuntimeCommandOptions = {
  readonly durationMs?: number | undefined;
};

export type RegisteredGpuFlowViewportRuntime = {
  applyViewportCommand(
    viewport: GpuViewportInput,
    options?: GpuViewportRuntimeCommandOptions,
  ): boolean;
  cancelViewportTransition(): boolean;
  enqueuePan(delta: GpuPoint): boolean;
  enqueueZoomByFactorAtPoint(input: {
    readonly factor: number;
    readonly point: GpuPoint;
  }): boolean;
  flushObserverSnapshot(): void;
  getViewport(): GpuViewport;
  getViewportTuple(): GpuViewportTuple;
};

const registeredGpuFlowViewportRuntimes = new WeakMap<
  GpuFlowViewportStoreApi,
  RegisteredGpuFlowViewportRuntime
>();

export function registerGpuFlowViewportRuntime(
  store: GpuFlowViewportStoreApi,
  runtime: RegisteredGpuFlowViewportRuntime,
): () => void {
  registeredGpuFlowViewportRuntimes.set(store, runtime);
  return () => {
    if (registeredGpuFlowViewportRuntimes.get(store) === runtime) {
      registeredGpuFlowViewportRuntimes.delete(store);
    }
  };
}

export function getRegisteredGpuFlowViewportRuntime(
  store: GpuFlowViewportStoreApi,
): RegisteredGpuFlowViewportRuntime | undefined {
  return registeredGpuFlowViewportRuntimes.get(store);
}
