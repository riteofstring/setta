import { useEffect, type CSSProperties, type RefObject } from "react";
import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "./animationFrame";
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
      frameId = requestGpuAnimationFrame(apply);
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
        cancelGpuAnimationFrame(frameId);
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
