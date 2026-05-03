import { useEffect, type MutableRefObject } from "react";

import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  attachGpuRetainedContentInteractionController,
  type GpuRetainedContentInteractionControllerOptions,
} from "../interactions/retainedContentInteraction";
import {
  attachGpuRetainedContentKeyboardController,
  type GpuRetainedContentKeyboardControllerOptions,
} from "../interactions/retainedContentKeyboard";
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

export type GpuFlowRetainedContentKeyboardOptions =
  | false
  | Omit<
      GpuRetainedContentKeyboardControllerOptions,
      "element" | "getScene" | "requestFrame"
    >
  | undefined;

export type GpuFlowRetainedContentControllerOptions = {
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly nodeLayerRef: MutableRefObject<{
    readonly scene: GpuFlowScene | undefined;
  }>;
  readonly retainedContentInteraction: GpuFlowRetainedContentInteractionOptions;
  readonly retainedContentKeyboard: GpuFlowRetainedContentKeyboardOptions;
  readonly retainedContentScroll: GpuFlowRetainedContentScrollOptions;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
};

export function useGpuFlowRetainedContentControllers({
  containerRef,
  nodeLayerRef,
  retainedContentInteraction,
  retainedContentKeyboard,
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
    if (retainedContentKeyboard === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !retainedContentKeyboard) {
      return;
    }
    return attachGpuRetainedContentKeyboardController({
      ...retainedContentKeyboard,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
    });
  }, [containerRef, nodeLayerRef, retainedContentKeyboard, surfaceRef]);

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
