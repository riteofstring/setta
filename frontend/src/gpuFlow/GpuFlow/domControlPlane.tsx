import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import type {
  GpuRetainedDomControlActivation,
  GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import {
  flowToScreenPosition,
  getVisibleFlowRect,
  normalizeGpuViewport,
  type GpuRect,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

export type GpuFlowDomControlActivationHandler = (
  control: GpuRetainedDomControlSourceDescriptor,
  activation: GpuRetainedDomControlActivation,
) => void;

export type GpuFlowDomControlRenderer = (
  control: GpuRetainedDomControlSourceDescriptor,
  context: {
    readonly onActivate: GpuFlowDomControlActivationHandler | undefined;
    readonly presentation: "dom-control-plane";
  },
) => ReactNode;

export type GpuFlowRetainedScrollOffsetGetter = (
  surfaceId: string,
) => { readonly x: number; readonly y: number } | null | undefined;

type MountedDomControlPlaneHost = {
  readonly controlId: string;
  readonly element: HTMLElement;
};

type DomControlPlaneDiagnostics = {
  activeControlId: string | null;
  clippedControlCount: number;
  committedFrameId: number;
  lastProjectionBatchDurationMs: number;
  mountedControlCount: number;
  projectionWriteCount: number;
  runtimeFrameId: number;
  visibleControlRectCount: number;
};

const GPU_FLOW_DOM_CONTROL_PLANE_CLASS_NAME =
  "setta-gpu-flow__dom-control-plane";
const GPU_FLOW_DOM_CONTROL_HOST_CLASS_NAME = [
  "setta-gpu-flow__dom-control",
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
].join(" ");
const GPU_FLOW_DOM_CONTROL_OVERSCAN_CSS_PX = 160;
const GPU_FLOW_DOM_CONTROL_MIN_MOUNT_SCREEN_HEIGHT_CSS_PX = 18;
const GPU_FLOW_DOM_CONTROL_MIN_VISIBLE_SCREEN_HEIGHT_CSS_PX = 8;
const GPU_FLOW_DOM_CONTROL_MAX_LOW_LOD_MOUNTED_CONTROLS = 8;
const GPU_FLOW_DOM_CONTROL_SMALL_SCENE_LOW_LOD_CONTROL_LIMIT = 64;

const EMPTY_DOM_CONTROL_DESCRIPTORS: readonly GpuRetainedDomControlSourceDescriptor[] =
  [];

export function GpuFlowDomControlPlane({
  committedFrameId,
  getRetainedScrollOffset,
  onActivate,
  renderControl,
  retainedRuntimeFrame,
  viewportStore,
  viewportRuntime,
}: {
  readonly committedFrameId?: number | undefined;
  readonly getRetainedScrollOffset?: GpuFlowRetainedScrollOffsetGetter;
  readonly onActivate: GpuFlowDomControlActivationHandler | undefined;
  readonly renderControl: GpuFlowDomControlRenderer | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const frameIds = useMemo(
    () =>
      resolveGpuFlowDomControlPlaneFrameIds({
        committedFrameId,
        retainedRuntimeFrame,
      }),
    [committedFrameId, retainedRuntimeFrame],
  );
  const hostByControlIdRef = useRef(
    new Map<string, MountedDomControlPlaneHost>(),
  );
  const controls = useMemo(
    () =>
      retainedRuntimeFrame?.descriptors.domControlSources ??
      EMPTY_DOM_CONTROL_DESCRIPTORS,
    [retainedRuntimeFrame],
  );
  const diagnosticsRef = useRef<DomControlPlaneDiagnostics>(
    createEmptyDomControlPlaneDiagnostics({
      committedFrameId: frameIds.committedFrameId,
      runtimeFrameId: frameIds.runtimeFrameId,
    }),
  );

  const controlById = useMemo(
    () => new Map(controls.map((control) => [control.sourceId, control])),
    [controls],
  );
  const controlByIdRef = useRef(controlById);
  controlByIdRef.current = controlById;
  const controlsToMount = useMemo(
    () =>
      filterGpuFlowDomControlPlaneMountedControls({
        controls,
        getRetainedScrollOffset,
        viewport: getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime }),
      }),
    [controls, getRetainedScrollOffset, viewportRuntime],
  );

  const setControlElement = useCallback(
    (controlId: string, element: HTMLElement | null) => {
      if (!element) {
        const mounted = hostByControlIdRef.current.get(controlId);
        if (mounted) {
          blurFocusedDescendantBeforeUnmount(mounted.element);
        }
        hostByControlIdRef.current.delete(controlId);
        return;
      }
      const control = controlById.get(controlId);
      if (!control) {
        return;
      }
      hostByControlIdRef.current.set(controlId, { controlId, element });
      syncGpuFlowDomControlPlaneElementStyle({
        control,
        element,
        getRetainedScrollOffset,
        viewport: getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime }),
      });
    },
    [controlById, getRetainedScrollOffset, viewportRuntime],
  );

  useLayoutEffect(() => {
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        syncGpuFlowDomControlPlaneStyles({
          committedFrameId: frameIds.committedFrameId,
          controlById: controlByIdRef.current,
          diagnosticsRef,
          getRetainedScrollOffset,
          hostByControlId: hostByControlIdRef.current,
          runtimeFrameId: frameIds.runtimeFrameId,
          viewport,
        });
      },
    });
  }, [frameIds, getRetainedScrollOffset, viewportRuntime]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      syncGpuFlowDomControlPlaneStyles({
        committedFrameId: frameIds.committedFrameId,
        controlById: controlByIdRef.current,
        diagnosticsRef,
        getRetainedScrollOffset,
        hostByControlId: hostByControlIdRef.current,
        runtimeFrameId: frameIds.runtimeFrameId,
        viewport: state.transform,
      });
    });
  }, [frameIds, getRetainedScrollOffset, viewportStore]);

  useLayoutEffect(() => {
    syncGpuFlowDomControlPlaneStyles({
      committedFrameId: frameIds.committedFrameId,
      controlById,
      diagnosticsRef,
      getRetainedScrollOffset,
      hostByControlId: hostByControlIdRef.current,
      runtimeFrameId: frameIds.runtimeFrameId,
      viewport: getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime }),
    });
  }, [controlById, frameIds, getRetainedScrollOffset, viewportRuntime]);

  useLayoutEffect(() => {
    const view = window as typeof window & {
      __settaGpuFlowDomControlPlaneDiagnostics?: () => DomControlPlaneDiagnostics;
    };
    view.__settaGpuFlowDomControlPlaneDiagnostics = () => ({
      ...diagnosticsRef.current,
    });
    return () => {
      if (view.__settaGpuFlowDomControlPlaneDiagnostics) {
        delete view.__settaGpuFlowDomControlPlaneDiagnostics;
      }
    };
  }, []);

  if (!renderControl) {
    return null;
  }

  const viewport = normalizeGpuViewport(
    getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime }),
  );
  return (
    <div
      className={GPU_FLOW_DOM_CONTROL_PLANE_CLASS_NAME}
      data-gpu-flow-dom-control-plane="true"
      data-gpu-flow-dom-control-plane-frame-id={frameIds.runtimeFrameId}
      data-gpu-flow-dom-control-plane-committed-frame-id={
        frameIds.committedFrameId
      }
    >
      {controlsToMount.map((control) => {
        const initialStyle = projectGpuFlowDomControlPlaneHost({
          control,
          getRetainedScrollOffset,
          viewport,
        });
        return (
          <GpuFlowDomControlHost
            control={control}
            getRetainedScrollOffset={getRetainedScrollOffset}
            initialStyle={initialStyle}
            key={control.sourceId}
            onActivate={onActivate}
            renderControl={renderControl}
            setControlElement={setControlElement}
          />
        );
      })}
    </div>
  );
}

function GpuFlowDomControlHost({
  control,
  getRetainedScrollOffset,
  initialStyle,
  onActivate,
  renderControl,
  setControlElement,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly initialStyle: ReturnType<typeof projectGpuFlowDomControlPlaneHost>;
  readonly onActivate: GpuFlowDomControlActivationHandler | undefined;
  readonly renderControl: GpuFlowDomControlRenderer;
  readonly setControlElement: (
    controlId: string,
    element: HTMLElement | null,
  ) => void;
}) {
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  const clip = geometry.visibleClipFlowPx;
  return (
    <div
      className={GPU_FLOW_DOM_CONTROL_HOST_CLASS_NAME}
      data-gpu-flow-dom-control="true"
      data-gpu-flow-dom-control-id={control.sourceId}
      data-gpu-flow-dom-control-row-id={control.rowId}
      data-gpu-flow-dom-control-section-id={control.sectionId}
      data-gpu-flow-dom-control-surface-id={control.surfaceId}
      data-gpu-flow-dom-control-active={control.active ? "true" : "false"}
      onPointerDownCapture={(event) => {
        if (control.active || control.disabled) {
          return;
        }
        onActivate?.(control, {
          clientPoint: {
            x: event.clientX,
            y: event.clientY,
          },
          kind: "pointer",
        });
      }}
      ref={(element) => setControlElement(control.sourceId, element)}
      style={initialStyle}
    >
      <div
        className="setta-gpu-flow__dom-control-content"
        style={{
          height: control.sourceRectCssPx.height,
          left: -(clip.x - geometry.worldRectFlowPx.x),
          position: "absolute",
          top: -(clip.y - geometry.worldRectFlowPx.y),
          width: control.sourceRectCssPx.width,
        }}
      >
        {renderControl(control, {
          onActivate,
          presentation: "dom-control-plane",
        })}
      </div>
    </div>
  );
}

function resolveGpuFlowDomControlPlaneFrameIds({
  committedFrameId,
  retainedRuntimeFrame,
}: {
  readonly committedFrameId: number | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
}): {
  readonly committedFrameId: number;
  readonly runtimeFrameId: number;
} {
  const runtimeFrameId = retainedRuntimeFrame?.frameId ?? 0;
  return {
    committedFrameId: committedFrameId ?? runtimeFrameId,
    runtimeFrameId,
  };
}

function getLiveGpuFlowDomControlPlaneViewport({
  viewportRuntime,
}: {
  readonly viewportRuntime: GpuFlowViewportRuntime;
}): GpuViewportTuple {
  return viewportRuntime.getViewportTuple();
}

function filterGpuFlowDomControlPlaneMountedControls({
  controls,
  getRetainedScrollOffset,
  viewport,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewport: GpuViewportInput;
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  const canvasSize = getGpuFlowDomControlPlaneViewportCanvasSize();
  const normalizedViewport = normalizeGpuViewport(viewport);
  const visibleFlowRect = getVisibleFlowRect({
    canvasHeight: canvasSize.height,
    canvasWidth: canvasSize.width,
    marginCssPx: GPU_FLOW_DOM_CONTROL_OVERSCAN_CSS_PX,
    viewport,
  });
  const candidates = controls
    .map((control) => {
      const geometry = projectGpuFlowDomControlPlaneGeometry({
        control,
        getRetainedScrollOffset,
      });
      if (!rectsIntersect(visibleFlowRect, geometry.worldRectFlowPx)) {
        return null;
      }
      return {
        control,
        distanceToViewportCenter: getGpuFlowDomControlPlaneDistanceToCenter({
          geometry,
          visibleFlowRect,
        }),
        renderable: isGpuFlowDomControlPlaneControlMountedAtViewport({
          control,
          geometry,
          viewport: normalizedViewport,
        }),
      };
    })
    .filter((candidate) => candidate !== null);
  const renderableControls = candidates
    .filter((candidate) => candidate.renderable)
    .map((candidate) => candidate.control);
  const lowLodLimit =
    candidates.length <= GPU_FLOW_DOM_CONTROL_SMALL_SCENE_LOW_LOD_CONTROL_LIMIT
      ? candidates.length
      : GPU_FLOW_DOM_CONTROL_MAX_LOW_LOD_MOUNTED_CONTROLS;
  const lowLodControls = candidates
    .filter((candidate) => !candidate.renderable && !candidate.control.active)
    .sort(
      (left, right) =>
        left.distanceToViewportCenter - right.distanceToViewportCenter ||
        compareGpuFlowDomControlPlaneControls(left.control, right.control),
    )
    .slice(0, lowLodLimit)
    .map((candidate) => candidate.control);
  return [...renderableControls, ...lowLodControls].sort(
    compareGpuFlowDomControlPlaneControls,
  );
}

function getGpuFlowDomControlPlaneDistanceToCenter({
  geometry,
  visibleFlowRect,
}: {
  readonly geometry: Pick<
    ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>,
    "worldRectFlowPx"
  >;
  readonly visibleFlowRect: GpuRect;
}): number {
  const controlCenterX =
    geometry.worldRectFlowPx.x + geometry.worldRectFlowPx.width / 2;
  const controlCenterY =
    geometry.worldRectFlowPx.y + geometry.worldRectFlowPx.height / 2;
  const viewportCenterX = visibleFlowRect.x + visibleFlowRect.width / 2;
  const viewportCenterY = visibleFlowRect.y + visibleFlowRect.height / 2;
  return Math.hypot(
    controlCenterX - viewportCenterX,
    controlCenterY - viewportCenterY,
  );
}

function compareGpuFlowDomControlPlaneControls(
  left: GpuRetainedDomControlSourceDescriptor,
  right: GpuRetainedDomControlSourceDescriptor,
): number {
  return (
    left.zOrder - right.zOrder ||
    left.surfaceId.localeCompare(right.surfaceId) ||
    left.rowId.localeCompare(right.rowId)
  );
}

function syncGpuFlowDomControlPlaneStyles({
  committedFrameId,
  controlById,
  diagnosticsRef,
  getRetainedScrollOffset,
  hostByControlId,
  runtimeFrameId,
  viewport,
}: {
  readonly committedFrameId: number;
  readonly controlById: ReadonlyMap<
    string,
    GpuRetainedDomControlSourceDescriptor
  >;
  readonly diagnosticsRef: MutableRefObject<DomControlPlaneDiagnostics>;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly hostByControlId: ReadonlyMap<string, MountedDomControlPlaneHost>;
  readonly runtimeFrameId: number;
  readonly viewport: GpuViewportInput;
}) {
  const startedAt = performance.now();
  const canvasSize = getGpuFlowDomControlPlaneViewportCanvasSize();
  const normalizedViewport = normalizeGpuViewport(viewport);
  let clippedControlCount = 0;
  let projectionWriteCount = 0;
  let visibleControlRectCount = 0;
  let activeControlId: string | null = null;
  const visibleFlowRect = getVisibleFlowRect({
    canvasHeight: canvasSize.height,
    canvasWidth: canvasSize.width,
    marginCssPx: GPU_FLOW_DOM_CONTROL_OVERSCAN_CSS_PX,
    viewport,
  });
  for (const host of hostByControlId.values()) {
    const control = controlById.get(host.controlId);
    if (!control) {
      continue;
    }
    if (control.active) {
      activeControlId = control.sourceId;
    }
    const result = syncGpuFlowDomControlPlaneControlProjection({
      control,
      getRetainedScrollOffset,
      hostByControlId,
      normalizedViewport,
      visibleFlowRect,
      viewport,
    });
    clippedControlCount += result.clippedControlCount;
    projectionWriteCount += result.projectionWriteCount;
    visibleControlRectCount += result.visibleControlRectCount;
  }
  diagnosticsRef.current = {
    activeControlId,
    clippedControlCount,
    committedFrameId,
    lastProjectionBatchDurationMs: performance.now() - startedAt,
    mountedControlCount: hostByControlId.size,
    projectionWriteCount,
    runtimeFrameId,
    visibleControlRectCount,
  };
}

function syncGpuFlowDomControlPlaneControlProjection({
  control,
  getRetainedScrollOffset,
  hostByControlId,
  normalizedViewport,
  visibleFlowRect,
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly hostByControlId: ReadonlyMap<string, MountedDomControlPlaneHost>;
  readonly normalizedViewport: ReturnType<typeof normalizeGpuViewport>;
  readonly visibleFlowRect: GpuRect;
  readonly viewport: GpuViewportInput;
}): Pick<
  DomControlPlaneDiagnostics,
  "clippedControlCount" | "projectionWriteCount" | "visibleControlRectCount"
> {
  const host = hostByControlId.get(control.sourceId);
  if (!host) {
    return emptyGpuFlowDomControlPlaneProjectionResult();
  }
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  if (!rectsIntersect(visibleFlowRect, geometry.worldRectFlowPx)) {
    return {
      ...emptyGpuFlowDomControlPlaneProjectionResult(),
      projectionWriteCount: hideGpuFlowDomControlPlaneElement(host.element),
    };
  }
  if (
    !isGpuFlowDomControlPlaneControlVisibleAtViewport({
      control,
      geometry,
      viewport: normalizedViewport,
    })
  ) {
    return {
      ...emptyGpuFlowDomControlPlaneProjectionResult(),
      projectionWriteCount: hideGpuFlowDomControlPlaneElement(host.element),
    };
  }
  const clip = geometry.visibleClipFlowPx;
  if (clip.width <= 0 || clip.height <= 0) {
    return {
      ...emptyGpuFlowDomControlPlaneProjectionResult(),
      projectionWriteCount: hideGpuFlowDomControlPlaneElement(host.element),
    };
  }
  return {
    clippedControlCount: isGpuFlowDomControlPlaneClipPartial(geometry) ? 1 : 0,
    projectionWriteCount: syncGpuFlowDomControlPlaneElementStyle({
      control,
      element: host.element,
      getRetainedScrollOffset,
      viewport,
    }),
    visibleControlRectCount: 1,
  };
}

function emptyGpuFlowDomControlPlaneProjectionResult(): Pick<
  DomControlPlaneDiagnostics,
  "clippedControlCount" | "projectionWriteCount" | "visibleControlRectCount"
> {
  return {
    clippedControlCount: 0,
    projectionWriteCount: 0,
    visibleControlRectCount: 0,
  };
}

function isGpuFlowDomControlPlaneClipPartial({
  visibleClipFlowPx,
  worldRectFlowPx,
}: ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>): boolean {
  return (
    visibleClipFlowPx.x !== worldRectFlowPx.x ||
    visibleClipFlowPx.y !== worldRectFlowPx.y ||
    visibleClipFlowPx.width !== worldRectFlowPx.width ||
    visibleClipFlowPx.height !== worldRectFlowPx.height
  );
}

function getGpuFlowDomControlPlaneViewportCanvasSize(): {
  readonly height: number;
  readonly width: number;
} {
  if (typeof window === "undefined") {
    return { height: 0, width: 0 };
  }
  return { height: window.innerHeight, width: window.innerWidth };
}

function syncGpuFlowDomControlPlaneElementStyle({
  control,
  element,
  getRetainedScrollOffset,
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly element: HTMLElement;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewport: GpuViewportInput;
}): number {
  const projection = projectGpuFlowDomControlPlaneHost({
    control,
    getRetainedScrollOffset,
    viewport: normalizeGpuViewport(viewport),
  });
  let writes = 0;
  writes += setStyleValue(element, "display", projection.display);
  writes += setStyleValue(element, "height", `${projection.height}px`);
  writes += setStyleValue(element, "left", `${projection.left}px`);
  writes += setStyleValue(element, "pointerEvents", projection.pointerEvents);
  writes += setStyleValue(element, "top", `${projection.top}px`);
  writes += setStyleValue(element, "transform", projection.transform);
  writes += setStyleValue(
    element,
    "transformOrigin",
    projection.transformOrigin,
  );
  writes += setStyleValue(element, "width", `${projection.width}px`);
  writes += setStyleValue(element, "zIndex", String(projection.zIndex));
  writes += syncGpuFlowDomControlPlaneContentStyle({
    control,
    element,
    getRetainedScrollOffset,
  });
  return writes;
}

function projectGpuFlowDomControlPlaneHost({
  control,
  getRetainedScrollOffset,
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}) {
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  const clip = geometry.visibleClipFlowPx;
  const renderable = isGpuFlowDomControlPlaneControlVisibleAtViewport({
    control,
    geometry,
    viewport,
  });
  const position = flowToScreenPosition(clip, viewport);
  return {
    display: renderable ? "" : "none",
    height: clip.height,
    left: position.x,
    pointerEvents:
      renderable && control.active ? ("auto" as const) : ("none" as const),
    top: position.y,
    transform: `scale(${viewport.zoom})`,
    transformOrigin: "top left",
    width: clip.width,
    zIndex: control.zOrder,
  };
}

function isGpuFlowDomControlPlaneControlMountedAtViewport({
  control,
  geometry,
  viewport,
}: {
  readonly control: Pick<GpuRetainedDomControlSourceDescriptor, "active">;
  readonly geometry: Pick<
    ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>,
    "visibleClipFlowPx"
  >;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): boolean {
  if (control.active) {
    return (
      geometry.visibleClipFlowPx.width > 0 &&
      geometry.visibleClipFlowPx.height > 0
    );
  }
  return isGpuFlowDomControlPlanePassiveRenderableAtViewport({
    geometry,
    minScreenHeightCssPx: GPU_FLOW_DOM_CONTROL_MIN_MOUNT_SCREEN_HEIGHT_CSS_PX,
    viewport,
  });
}

function isGpuFlowDomControlPlaneControlVisibleAtViewport({
  control,
  geometry,
  viewport,
}: {
  readonly control: Pick<GpuRetainedDomControlSourceDescriptor, "active">;
  readonly geometry: Pick<
    ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>,
    "visibleClipFlowPx"
  >;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): boolean {
  if (control.active) {
    return (
      geometry.visibleClipFlowPx.width > 0 &&
      geometry.visibleClipFlowPx.height > 0
    );
  }
  return isGpuFlowDomControlPlanePassiveRenderableAtViewport({
    geometry,
    minScreenHeightCssPx: GPU_FLOW_DOM_CONTROL_MIN_VISIBLE_SCREEN_HEIGHT_CSS_PX,
    viewport,
  });
}

function isGpuFlowDomControlPlanePassiveRenderableAtViewport({
  geometry,
  minScreenHeightCssPx,
  viewport,
}: {
  readonly geometry: Pick<
    ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>,
    "visibleClipFlowPx"
  >;
  readonly minScreenHeightCssPx: number;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): boolean {
  return (
    geometry.visibleClipFlowPx.width > 0 &&
    geometry.visibleClipFlowPx.height * viewport.zoom >= minScreenHeightCssPx
  );
}

function syncGpuFlowDomControlPlaneContentStyle({
  control,
  element,
  getRetainedScrollOffset,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly element: HTMLElement;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
}): number {
  const content = element.firstElementChild;
  if (!(content instanceof HTMLElement)) {
    return 0;
  }
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  const clip = geometry.visibleClipFlowPx;
  let writes = 0;
  writes += setStyleValue(
    content,
    "height",
    `${control.sourceRectCssPx.height}px`,
  );
  writes += setStyleValue(
    content,
    "left",
    `${-(clip.x - geometry.worldRectFlowPx.x)}px`,
  );
  writes += setStyleValue(
    content,
    "top",
    `${-(clip.y - geometry.worldRectFlowPx.y)}px`,
  );
  writes += setStyleValue(
    content,
    "width",
    `${control.sourceRectCssPx.width}px`,
  );
  return writes;
}

function hideGpuFlowDomControlPlaneElement(element: HTMLElement): number {
  let writes = 0;
  writes += setStyleValue(element, "display", "none");
  writes += setStyleValue(element, "pointerEvents", "none");
  return writes;
}

function projectGpuFlowDomControlPlaneGeometry({
  control,
  getRetainedScrollOffset,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
}): {
  readonly visibleClipFlowPx: GpuRect;
  readonly worldRectFlowPx: GpuRect;
} {
  const worldRectFlowPx = projectGpuFlowDomControlPlaneWorldRect({
    control,
    getRetainedScrollOffset,
  });
  return {
    visibleClipFlowPx: getGpuFlowDomControlPlaneVisibleClip({
      control,
      worldRectFlowPx,
    }),
    worldRectFlowPx,
  };
}

function projectGpuFlowDomControlPlaneWorldRect({
  control,
  getRetainedScrollOffset,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
}): GpuRect {
  const liveScrollOffset = getRetainedScrollOffset?.(control.surfaceId);
  if (!liveScrollOffset) {
    return control.worldRectFlowPx;
  }
  const scrollDeltaX = liveScrollOffset.x - control.sectionScrollOffset.x;
  const scrollDeltaY = liveScrollOffset.y - control.sectionScrollOffset.y;
  if (scrollDeltaX === 0 && scrollDeltaY === 0) {
    return control.worldRectFlowPx;
  }
  return {
    ...control.worldRectFlowPx,
    x: control.worldRectFlowPx.x - scrollDeltaX,
    y: control.worldRectFlowPx.y - scrollDeltaY,
  };
}

function getGpuFlowDomControlPlaneVisibleClip({
  control,
  worldRectFlowPx,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly worldRectFlowPx: GpuRect;
}): GpuRect {
  return intersectRects(worldRectFlowPx, control.sectionClipRectFlowPx);
}

function blurFocusedDescendantBeforeUnmount(element: HTMLElement) {
  const activeElement = element.ownerDocument.activeElement;
  if (activeElement instanceof HTMLElement && element.contains(activeElement)) {
    activeElement.blur();
  }
}

function createEmptyDomControlPlaneDiagnostics({
  committedFrameId,
  runtimeFrameId,
}: {
  readonly committedFrameId: number;
  readonly runtimeFrameId: number;
}): DomControlPlaneDiagnostics {
  return {
    activeControlId: null,
    clippedControlCount: 0,
    committedFrameId,
    lastProjectionBatchDurationMs: 0,
    mountedControlCount: 0,
    projectionWriteCount: 0,
    runtimeFrameId,
    visibleControlRectCount: 0,
  };
}

function intersectRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, bottomEdge - y),
    width: Math.max(0, rightEdge - x),
    x,
    y,
  };
}

function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function setStyleValue(
  element: HTMLElement,
  property:
    | "display"
    | "height"
    | "left"
    | "pointerEvents"
    | "top"
    | "transform"
    | "transformOrigin"
    | "width"
    | "zIndex",
  value: string,
): number {
  if (element.style[property] === value) {
    return 0;
  }
  element.style[property] = value;
  return 1;
}
