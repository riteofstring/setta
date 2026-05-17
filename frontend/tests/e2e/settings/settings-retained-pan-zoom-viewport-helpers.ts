import type { Page } from "@playwright/test";

export async function readViewportSample(page: Page) {
  return await page.evaluate(() => {
    const viewport =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
    if (!viewport) {
      throw new Error("Missing GPU flow debug viewport.");
    }
    return viewport;
  });
}

export async function readViewportRuntimeDebug(page: Page) {
  return await page.evaluate(async () => {
    const [{ getRegisteredGpuFlowViewportRuntime }, { gpuFlowViewportStore }] =
      await Promise.all([
        import("/src/gpuFlow/viewportRuntimeRegistry.ts"),
        import("/src/gpuFlow/viewportStore.ts"),
      ]);
    return {
      publicTransform: gpuFlowViewportStore.getState().transform,
      registeredRuntimeViewport:
        getRegisteredGpuFlowViewportRuntime(
          gpuFlowViewportStore,
        )?.getViewportTuple() ?? null,
    };
  });
}
