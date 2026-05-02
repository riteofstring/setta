import { useEffect, type CSSProperties, type RefObject } from "react";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";
import type { GpuFlowViewportStoreApi } from "./viewportStore";

export function useGpuEdgeViewportLayerSync({
  layerRef,
  viewportStore,
}: {
  readonly layerRef: RefObject<HTMLElement | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  useEffect(() => {
    let frameId: number | null = null;

    const apply = () => {
      frameId = null;
      applyGpuEdgeViewportLayerTransform(
        layerRef.current,
        viewportStore.getState().transform,
      );
    };
    const schedule = () => {
      if (frameId !== null) {
        return;
      }
      frameId = requestGpuEdgeViewportLayerFrame(apply);
    };

    apply();
    const unsubscribe = viewportStore.subscribe((state, previousState) => {
      if (state.transform !== previousState.transform) {
        schedule();
      }
    });

    return () => {
      unsubscribe();
      if (frameId !== null) {
        cancelGpuEdgeViewportLayerFrame(frameId);
      }
    };
  }, [layerRef, viewportStore]);
}

export function getGpuEdgeViewportLayerStyle(
  viewport: GpuViewportInput,
): CSSProperties {
  return {
    transform: getGpuEdgeViewportLayerTransform(viewport),
  };
}

function applyGpuEdgeViewportLayerTransform(
  layer: HTMLElement | null,
  viewport: GpuViewportInput,
) {
  if (!layer) {
    return;
  }
  const transform = getGpuEdgeViewportLayerTransform(viewport);
  if (layer.style.transform !== transform) {
    layer.style.transform = transform;
  }
}

function getGpuEdgeViewportLayerTransform(viewport: GpuViewportInput): string {
  const normalized = normalizeGpuViewport(viewport);
  return `translate(${normalized.x}px, ${normalized.y}px) scale(${normalized.zoom})`;
}

function requestGpuEdgeViewportLayerFrame(
  callback: FrameRequestCallback,
): number {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(performance.now()), 16);
}

function cancelGpuEdgeViewportLayerFrame(frameId: number) {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(frameId);
    return;
  }
  window.clearTimeout(frameId);
}
