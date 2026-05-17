import {
  useCallback,
  useEffect,
  useMemo,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  clearGpuNodeDomTransformSyncCache,
  clearGpuNodeDomTransformSyncCacheNode,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";
import type { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import {
  createGpuFlowViewportRuntime,
  type GpuFlowViewportRuntime,
} from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  destroyNodeInteractionResources,
  destroyNodeLayerResources,
} from "./flowFrame";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import type { GpuFlowCallbacks } from "./flowSurfaceTypes";
import { clearGpuFlowNodeElement } from "./sourceInteraction";

export function useGpuFlowViewportRuntime({
  surfaceRef,
  viewportStore,
}: {
  readonly surfaceRef: RefObject<GpuSurfaceHandle | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): {
  readonly requestSurfaceFrame: (reason: GpuFrameReason) => void;
  readonly viewportRuntime: GpuFlowViewportRuntime;
} {
  const requestSurfaceFrame = useCallback(
    (reason: GpuFrameReason) => surfaceRef.current?.requestFrame(reason),
    [surfaceRef],
  );
  const viewportRuntime = useMemo(
    () =>
      createGpuFlowViewportRuntime({
        requestFrame: requestSurfaceFrame,
        store: viewportStore,
      }),
    [requestSurfaceFrame, viewportStore],
  );
  return { requestSurfaceFrame, viewportRuntime };
}

declare global {
  interface Window {
    __settaGpuFlowNodeScreenRect?:
      | ((
          nodeId: string,
        ) => { height: number; width: number; x: number; y: number } | null)
      | undefined;
  }
}

export function useGpuFlowNodeScreenRectDebug({
  containerRef,
  nodeLayerRef,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
}) {
  useEffect(() => {
    const view = containerRef.current?.ownerDocument.defaultView;
    if (!view) {
      return;
    }
    const previousResolver = view.__settaGpuFlowNodeScreenRect;
    const resolver: NonNullable<Window["__settaGpuFlowNodeScreenRect"]> = (
      nodeId,
    ) => {
      const container = containerRef.current;
      const node = nodeLayerRef.current.nodes?.find(
        (candidate) => candidate.nodeId === nodeId,
      );
      if (!container || !node || node.width === null || node.height === null) {
        return null;
      }
      const [viewportX, viewportY, zoom] = nodeLayerRef.current.viewport;
      const containerRect = container.getBoundingClientRect();
      return {
        height: node.height * zoom,
        width: node.width * zoom,
        x: containerRect.left + viewportX + node.x * zoom,
        y: containerRect.top + viewportY + node.y * zoom,
      };
    };
    view.__settaGpuFlowNodeScreenRect = resolver;
    return () => {
      if (view.__settaGpuFlowNodeScreenRect === resolver) {
        view.__settaGpuFlowNodeScreenRect = previousResolver;
      }
    };
  }, [containerRef, nodeLayerRef]);
}

export function useGpuFlowSurfaceResourceCleanup({
  htmlSurfaceRendererRef,
  nodeDomTransformSyncCacheRef,
  nodeInteractionCleanupRef,
  nodeInteractionRef,
  retainedContentPageManagerRef,
  retainedContentSwitchAnimations,
  sourceInteractionProjector,
  textureManagerRef,
  viewportRuntime,
}: {
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeInteractionCleanupRef: MutableRefObject<(() => void) | null>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly retainedContentSwitchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly sourceInteractionProjector: HtmlSurfaceInteractionProjector;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  useEffect(() => {
    return () => {
      sourceInteractionProjector.destroy();
      clearGpuNodeDomTransformSyncCache(nodeDomTransformSyncCacheRef.current);
      destroyNodeInteractionResources(
        nodeInteractionRef,
        nodeInteractionCleanupRef,
      );
      retainedContentSwitchAnimations.clear();
      destroyNodeLayerResources(
        textureManagerRef,
        htmlSurfaceRendererRef,
        retainedContentPageManagerRef,
      );
      viewportRuntime.destroy();
    };
  }, [
    htmlSurfaceRendererRef,
    nodeDomTransformSyncCacheRef,
    nodeInteractionCleanupRef,
    nodeInteractionRef,
    retainedContentPageManagerRef,
    retainedContentSwitchAnimations,
    sourceInteractionProjector,
    textureManagerRef,
    viewportRuntime,
  ]);
}

export function useGpuFlowNodeElementChangeHandler({
  callbacksRef,
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  nodeInteractionRef,
  sourceInteractionProjector,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly sourceInteractionProjector: HtmlSurfaceInteractionProjector;
  readonly surfaceRef: RefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}): (nodeId: string, element: HTMLElement | null) => void {
  return useCallback(
    (nodeId: string, element: HTMLElement | null) => {
      callbacksRef.current.onNodeElementChange?.(nodeId, element);
      clearGpuNodeDomTransformSyncCacheNode(
        nodeDomTransformSyncCacheRef.current,
        nodeId,
      );
      if (!element) {
        clearGpuFlowNodeElement({
          nodeElementByIdRef,
          nodeId,
          nodeInteractionRef,
          sourceInteractionProjector,
          textureManagerRef,
          transformOnlyPaintNodeIdsRef,
        });
        return;
      }

      nodeElementByIdRef.current.set(nodeId, element);
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [
      callbacksRef,
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      nodeInteractionRef,
      sourceInteractionProjector,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    ],
  );
}
