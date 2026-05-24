import { useCallback, type MutableRefObject } from "react";

import type { GpuSurfaceHandle, GpuSurfaceProps } from "../GpuSurface";
import { markHtmlSurfaceFramePaintDirty } from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import { nextFrame } from "./flowFrame";
import type { GpuFlowCallbacks } from "./flowSurfaceTypes";

type GpuFlowSurfacePaintHandler = NonNullable<GpuSurfaceProps["onPaint"]>;
type GpuFlowSurfacePaintRuntime = Parameters<GpuFlowSurfacePaintHandler>[0];
type GpuFlowSurfacePaintEvent = Parameters<GpuFlowSurfacePaintHandler>[1];

type GpuFlowSurfacePaintHandlerRefs = {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly frameRef: MutableRefObject<number>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
};

export type GpuFlowSurfacePaintInput = {
  readonly callbacks: GpuFlowCallbacks;
  readonly event: GpuFlowSurfacePaintEvent;
  readonly getFrame: () => number;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
  readonly runtime: GpuFlowSurfacePaintRuntime;
  readonly scheduleFollowUpFrame?: ((callback: () => void) => void) | undefined;
  readonly surface: Pick<GpuSurfaceHandle, "requestFrame"> | null;
  readonly textureManager: Pick<
    HtmlSurfaceTextureManager,
    "getDirtySurfaces" | "markSurfaceTextureDirty" | "markSurfacesPainted"
  > | null;
  readonly transformOnlyPaintNodeIds: Set<string>;
};

export function useGpuFlowSurfacePaintHandler({
  callbacksRef,
  frameRef,
  nodeElementByIdRef,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: GpuFlowSurfacePaintHandlerRefs): GpuFlowSurfacePaintHandler {
  return useCallback<GpuFlowSurfacePaintHandler>(
    (runtime, event) =>
      handleGpuFlowSurfacePaint({
        callbacks: callbacksRef.current,
        event,
        getFrame: () => nextFrame(frameRef),
        nodeElementById: nodeElementByIdRef.current,
        runtime,
        surface: surfaceRef.current,
        textureManager: textureManagerRef.current,
        transformOnlyPaintNodeIds: transformOnlyPaintNodeIdsRef.current,
      }),
    [],
  );
}

export function handleGpuFlowSurfacePaint({
  callbacks,
  event,
  getFrame,
  nodeElementById,
  runtime,
  scheduleFollowUpFrame = scheduleGpuFlowSurfacePaintDirtyFollowUpFrame,
  surface,
  textureManager,
  transformOnlyPaintNodeIds,
}: GpuFlowSurfacePaintInput) {
  let dirtyPaintSurfaceCount = 0;
  if (textureManager) {
    const dirtySurfaceIds = markHtmlSurfaceFramePaintDirty({
      changedElements: event.changedElements,
      elementByNodeId: nodeElementById,
      frame: getFrame(),
      ignoreDirectNodeIds: transformOnlyPaintNodeIds,
      textureManager,
    });
    dirtyPaintSurfaceCount = dirtySurfaceIds.length;
  }
  callbacks.onPaint?.(runtime, event);
  if (event.changedElements?.length) {
    transformOnlyPaintNodeIds.clear();
  }
  if (
    textureManager &&
    (dirtyPaintSurfaceCount > 0 || textureManager.getDirtySurfaces().length > 0)
  ) {
    requestGpuFlowSurfacePaintDirtyTextureUploadFrame({
      scheduleFollowUpFrame,
      surface,
    });
  }
}

function requestGpuFlowSurfacePaintDirtyTextureUploadFrame({
  scheduleFollowUpFrame,
  surface,
}: {
  readonly scheduleFollowUpFrame: (callback: () => void) => void;
  readonly surface: Pick<GpuSurfaceHandle, "requestFrame"> | null;
}) {
  if (!surface) {
    return;
  }
  surface.requestFrame("manual");
  surface.requestFrame("texture-upload");
  scheduleFollowUpFrame(() => {
    surface.requestFrame("manual");
    surface.requestFrame("texture-upload");
  });
}

function scheduleGpuFlowSurfacePaintDirtyFollowUpFrame(
  callback: () => void,
): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => callback());
    return;
  }
  globalThis.setTimeout(callback, 0);
}
