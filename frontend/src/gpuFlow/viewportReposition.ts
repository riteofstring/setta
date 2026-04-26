import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

export function subscribeToGpuViewportReposition(
  store: GpuFlowViewportStoreApi = gpuFlowViewportStore,
): () => void {
  if (typeof window === "undefined") {
    return noop;
  }

  let rafId: number | null = null;
  const scheduleReposition = () => {
    if (rafId !== null) {
      return;
    }
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });
  };

  scheduleReposition();
  let previousTransform = store.getState().transform;
  const unsubscribe = store.subscribe((state) => {
    if (state.transform === previousTransform) {
      return;
    }
    previousTransform = state.transform;
    scheduleReposition();
  });

  return () => {
    unsubscribe();
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
  };
}

function noop() {}
