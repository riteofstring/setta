import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type UIEvent,
} from "react";

import {
  getGpuRetainedContentRuntimeScrollOffset,
  registerGpuRetainedContentNativeScrollSource,
  setGpuRetainedContentRuntimeScrollOffset,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import {
  getGpuRetainedContentMaxScrollOffset,
  type GpuRetainedContentScrollOffsetMap,
  type GpuRetainedContentScrollResult,
} from "../retainedContentScroll";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

type GpuFlowRetainedScrollSourceLayerProps = {
  readonly onScrollOffsetsCommit?:
    | ((
        scrollOffsets: GpuRetainedContentScrollOffsetMap,
        result: GpuRetainedContentScrollResult,
      ) => void)
    | undefined;
  readonly requestFrame: () => void;
  readonly runtimeState: GpuRetainedContentRuntimeState;
  readonly scene: GpuFlowScene | undefined;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: GpuFlowViewportStoreApi;
};

type GpuRetainedScrollableSurface = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

const GPU_FLOW_RETAINED_SCROLL_SOURCE_LAYER_CLASS =
  "setta-gpu-flow__retained-scroll-source-layer";
const GPU_FLOW_RETAINED_SCROLL_SOURCE_CLASS =
  "setta-gpu-flow__retained-scroll-source";
const GPU_FLOW_RETAINED_SCROLL_SPACER_CLASS =
  "setta-gpu-flow__retained-scroll-spacer";

export function GpuFlowRetainedScrollSourceLayer({
  onScrollOffsetsCommit,
  requestFrame,
  runtimeState,
  scene,
  viewportRuntime,
  viewportStore,
}: GpuFlowRetainedScrollSourceLayerProps) {
  const elementBySurfaceIdRef = useRef(new Map<string, HTMLElement>());
  const surfaces = useMemo(
    () => getGpuFlowRetainedScrollableSurfaces(scene),
    [scene],
  );
  const surfacesRef = useRef(surfaces);
  surfacesRef.current = surfaces;

  const setSourceElement = useCallback(
    (surfaceId: string, element: HTMLElement | null) => {
      if (!element) {
        elementBySurfaceIdRef.current.delete(surfaceId);
        return;
      }
      elementBySurfaceIdRef.current.set(surfaceId, element);
      const surface = surfacesRef.current.find(
        (candidate) => candidate.id === surfaceId,
      );
      if (surface) {
        syncGpuFlowRetainedScrollSourceElement({
          element,
          runtimeState,
          surface,
          viewport: viewportRuntime.getViewportTuple(),
        });
      }
    },
    [runtimeState, viewportRuntime],
  );

  useLayoutEffect(() => {
    syncGpuFlowRetainedScrollSourceLayerStyles({
      elementBySurfaceId: elementBySurfaceIdRef.current,
      runtimeState,
      surfaces: surfacesRef.current,
      viewport: viewportRuntime.getViewportTuple(),
    });
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        syncGpuFlowRetainedScrollSourceLayerStyles({
          elementBySurfaceId: elementBySurfaceIdRef.current,
          runtimeState,
          surfaces: surfacesRef.current,
          viewport,
        });
      },
    });
  }, [runtimeState, viewportRuntime]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      syncGpuFlowRetainedScrollSourceLayerStyles({
        elementBySurfaceId: elementBySurfaceIdRef.current,
        runtimeState,
        surfaces: surfacesRef.current,
        viewport: state.transform,
      });
    });
  }, [runtimeState, viewportStore]);

  useLayoutEffect(() => {
    syncGpuFlowRetainedScrollSourceLayerStyles({
      elementBySurfaceId: elementBySurfaceIdRef.current,
      runtimeState,
      surfaces,
      viewport: viewportRuntime.getViewportTuple(),
    });
  }, [runtimeState, surfaces, viewportRuntime]);

  if (surfaces.length === 0) {
    return null;
  }

  return (
    <div
      className={GPU_FLOW_RETAINED_SCROLL_SOURCE_LAYER_CLASS}
      data-gpu-flow-retained-scroll-source-layer="true"
    >
      {surfaces.map((surface) => (
        <GpuFlowRetainedScrollSource
          key={surface.id}
          onScrollOffsetsCommit={onScrollOffsetsCommit}
          requestFrame={requestFrame}
          runtimeState={runtimeState}
          setSourceElement={setSourceElement}
          surface={surface}
          viewport={viewportRuntime.getViewportTuple()}
        />
      ))}
    </div>
  );
}

function GpuFlowRetainedScrollSource({
  onScrollOffsetsCommit,
  requestFrame,
  runtimeState,
  setSourceElement,
  surface,
  viewport,
}: {
  readonly onScrollOffsetsCommit:
    | GpuFlowRetainedScrollSourceLayerProps["onScrollOffsetsCommit"]
    | undefined;
  readonly requestFrame: () => void;
  readonly runtimeState: GpuRetainedContentRuntimeState;
  readonly setSourceElement: (
    surfaceId: string,
    element: HTMLElement | null,
  ) => void;
  readonly surface: GpuRetainedScrollableSurface;
  readonly viewport: GpuViewportInput;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const sourceElementRef = useCallback(
    (element: HTMLDivElement | null) => {
      elementRef.current = element;
      setSourceElement(surface.id, element);
    },
    [setSourceElement, surface.id],
  );

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    return registerGpuRetainedContentNativeScrollSource({
      element,
      state: runtimeState,
      surfaceId: surface.id,
    });
  }, [runtimeState, surface.id]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    syncGpuFlowRetainedScrollSourceElement({
      element,
      runtimeState,
      surface,
      viewport,
    });
  }, [runtimeState, surface, viewport]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const scrollOffset = {
        x: element.scrollLeft,
        y: element.scrollTop,
      };
      const changed = setGpuRetainedContentRuntimeScrollOffset({
        scrollOffset,
        state: runtimeState,
        surfaceId: surface.id,
      });
      if (!changed) {
        return;
      }
      const scrollOffsets = new Map(runtimeState.scrollOffsets);
      const result = {
        changed: true,
        scrollOffsets,
        surfaceId: surface.id,
      };
      onScrollOffsetsCommit?.(scrollOffsets, result);
      requestFrame();
    },
    [onScrollOffsetsCommit, requestFrame, runtimeState, surface.id],
  );

  return (
    <div
      aria-hidden="true"
      className={GPU_FLOW_RETAINED_SCROLL_SOURCE_CLASS}
      data-gpu-flow-retained-scroll-source="true"
      data-gpu-flow-retained-scroll-source-id={surface.id}
      onScroll={onScroll}
      ref={sourceElementRef}
      style={getGpuFlowRetainedScrollSourceStyle(surface, viewport)}
      tabIndex={-1}
    >
      <div
        className={GPU_FLOW_RETAINED_SCROLL_SPACER_CLASS}
        style={{
          height: surface.retainedScene.contentRect.height,
          width: surface.retainedScene.contentRect.width,
        }}
      />
    </div>
  );
}

function getGpuFlowRetainedScrollableSurfaces(
  scene: GpuFlowScene | undefined,
): readonly GpuRetainedScrollableSurface[] {
  return (scene?.contentSurfaces ?? []).filter(
    (surface): surface is GpuRetainedScrollableSurface => {
      if (
        surface.renderer.kind !== "canvas-content" ||
        !surface.retainedScene
      ) {
        return false;
      }
      const maxOffset = getGpuRetainedContentMaxScrollOffset({
        contentRect: surface.retainedScene.contentRect,
        viewportRect: surface.retainedScene.viewportRect,
      });
      return maxOffset.x > 0 || maxOffset.y > 0;
    },
  );
}

function syncGpuFlowRetainedScrollSourceLayerStyles({
  elementBySurfaceId,
  runtimeState,
  surfaces,
  viewport,
}: {
  readonly elementBySurfaceId: ReadonlyMap<string, HTMLElement>;
  readonly runtimeState: GpuRetainedContentRuntimeState;
  readonly surfaces: readonly GpuRetainedScrollableSurface[];
  readonly viewport: GpuViewportInput;
}) {
  for (const surface of surfaces) {
    const element = elementBySurfaceId.get(surface.id);
    if (!element) {
      continue;
    }
    syncGpuFlowRetainedScrollSourceElement({
      element,
      runtimeState,
      surface,
      viewport,
    });
  }
}

function syncGpuFlowRetainedScrollSourceElement({
  element,
  runtimeState,
  surface,
  viewport,
}: {
  readonly element: HTMLElement;
  readonly runtimeState: GpuRetainedContentRuntimeState;
  readonly surface: GpuRetainedScrollableSurface;
  readonly viewport: GpuViewportInput;
}) {
  const style = getGpuFlowRetainedScrollSourceStyle(surface, viewport);
  element.style.display = "";
  element.style.height = `${style.height}px`;
  element.style.left = `${style.left}px`;
  element.style.top = `${style.top}px`;
  element.style.transform = String(style.transform ?? "");
  element.style.transformOrigin = String(style.transformOrigin ?? "");
  element.style.width = `${style.width}px`;
  element.style.zIndex = String(style.zIndex ?? "");
  const scrollOffset = getGpuRetainedContentRuntimeScrollOffset({
    state: runtimeState,
    surface,
  });
  if (!scrollOffset) {
    return;
  }
  if (Math.abs(element.scrollLeft - scrollOffset.x) > 0.5) {
    element.scrollLeft = scrollOffset.x;
  }
  if (Math.abs(element.scrollTop - scrollOffset.y) > 0.5) {
    element.scrollTop = scrollOffset.y;
  }
}

function getGpuFlowRetainedScrollSourceStyle(
  surface: GpuRetainedScrollableSurface,
  viewport: GpuViewportInput,
): CSSProperties {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const position = flowToScreenPosition(surface.rect, normalizedViewport);
  return {
    height: surface.retainedScene.viewportRect.height,
    left: position.x,
    top: position.y,
    transform: `scale(${normalizedViewport.zoom})`,
    transformOrigin: "top left",
    width: surface.retainedScene.viewportRect.width,
    zIndex: surface.zIndex + 1,
  };
}
