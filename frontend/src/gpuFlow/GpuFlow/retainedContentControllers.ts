import { useEffect, type MutableRefObject } from "react";

import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  attachGpuRetainedContentInteractionController,
  type GpuRetainedContentInteractionControllerOptions,
} from "../interactions/retainedContentInteraction";
import {
  attachGpuRetainedContentScrollController,
  type GpuRetainedContentScrollControllerOptions,
} from "../interactions/retainedContentScroll";
import type { GpuFlowScene } from "../scene";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

export type GpuFlowRetainedContentInteractionOptions =
  | false
  | Omit<
      GpuRetainedContentInteractionControllerOptions,
      "element" | "getScene" | "requestFrame" | "store"
    >
  | undefined;

export type GpuFlowRetainedContentScrollOptions =
  | false
  | Omit<
      GpuRetainedContentScrollControllerOptions,
      "element" | "getScene" | "requestFrame" | "store"
    >
  | undefined;

export type GpuFlowRetainedContentControllerOptions = {
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly nodeLayerRef: MutableRefObject<{
    readonly scene: GpuFlowScene | undefined;
  }>;
  readonly retainedContentInteraction: GpuFlowRetainedContentInteractionOptions;
  readonly retainedContentScroll: GpuFlowRetainedContentScrollOptions;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
};

export function useGpuFlowRetainedContentControllers({
  containerRef,
  nodeLayerRef,
  retainedContentInteraction,
  retainedContentScroll,
  surfaceRef,
  viewportStore,
}: GpuFlowRetainedContentControllerOptions) {
  useEffect(() => {
    if (retainedContentInteraction === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !retainedContentInteraction) {
      return;
    }
    return attachGpuRetainedContentInteractionController({
      ...retainedContentInteraction,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      store: viewportStore,
    });
  }, [
    containerRef,
    nodeLayerRef,
    retainedContentInteraction,
    surfaceRef,
    viewportStore,
  ]);

  useEffect(() => {
    if (retainedContentScroll === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !retainedContentScroll) {
      return;
    }
    return attachGpuRetainedContentScrollController({
      ...retainedContentScroll,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      store: viewportStore,
    });
  }, [
    containerRef,
    nodeLayerRef,
    retainedContentScroll,
    surfaceRef,
    viewportStore,
  ]);
}
