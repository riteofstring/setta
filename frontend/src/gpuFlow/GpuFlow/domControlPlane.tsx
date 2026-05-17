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

export type GpuFlowDomControlRenderContext = {
  readonly onActivate: GpuFlowDomControlActivationHandler | undefined;
  readonly presentation: "dom-control-plane";
};

export type GpuFlowDomControlRenderer = (
  control: GpuRetainedDomControlSourceDescriptor,
  context: GpuFlowDomControlRenderContext,
) => ReactNode;

type MountedDomControlPlaneHost = {
  readonly controlId: string;
  readonly element: HTMLElement;
};

type DomControlPlaneDiagnostics = {
  activeControlId: string | null;
  clippedControlCount: number;
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

const EMPTY_DOM_CONTROL_DESCRIPTORS: readonly GpuRetainedDomControlSourceDescriptor[] =
  [];

export function GpuFlowDomControlPlane({
  onActivate,
  renderControl,
  retainedRuntimeFrame,
  viewportStore,
  viewportRuntime,
}: {
  readonly onActivate: GpuFlowDomControlActivationHandler | undefined;
  readonly renderControl: GpuFlowDomControlRenderer | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const hostByControlIdRef = useRef(
    new Map<string, MountedDomControlPlaneHost>(),
  );
  const controls = useMemo(
    () =>
      retainedRuntimeFrame?.descriptors.domControlSources ??
      EMPTY_DOM_CONTROL_DESCRIPTORS,
    [retainedRuntimeFrame],
  );
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const diagnosticsRef = useRef<DomControlPlaneDiagnostics>(
    createEmptyDomControlPlaneDiagnostics(retainedRuntimeFrame?.frameId ?? 0),
  );

  const controlById = useMemo(
    () => new Map(controls.map((control) => [control.sourceId, control])),
    [controls],
  );
  const controlsToMount = useMemo(
    () =>
      filterGpuFlowDomControlPlaneMountedControls({
        controls,
        viewport: getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime }),
      }),
    [controls, viewportRuntime],
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
        viewport: getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime }),
      });
    },
    [controlById, viewportRuntime],
  );

  useLayoutEffect(() => {
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        syncGpuFlowDomControlPlaneStyles({
          controls: controlsRef.current,
          diagnosticsRef,
          hostByControlId: hostByControlIdRef.current,
          runtimeFrameId: retainedRuntimeFrame?.frameId ?? 0,
          viewport,
        });
      },
    });
  }, [retainedRuntimeFrame?.frameId, viewportRuntime]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      syncGpuFlowDomControlPlaneStyles({
        controls: controlsRef.current,
        diagnosticsRef,
        hostByControlId: hostByControlIdRef.current,
        runtimeFrameId: retainedRuntimeFrame?.frameId ?? 0,
        viewport: state.transform,
      });
    });
  }, [retainedRuntimeFrame?.frameId, viewportStore]);

  useLayoutEffect(() => {
    syncGpuFlowDomControlPlaneStyles({
      controls,
      diagnosticsRef,
      hostByControlId: hostByControlIdRef.current,
      runtimeFrameId: retainedRuntimeFrame?.frameId ?? 0,
      viewport: getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime }),
    });
  }, [controls, retainedRuntimeFrame?.frameId, viewportRuntime]);

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
      data-gpu-flow-dom-control-plane-frame-id={
        retainedRuntimeFrame?.frameId ?? 0
      }
    >
      {controlsToMount.map((control) => {
        const clip = getGpuFlowDomControlPlaneVisibleClip(control);
        const initialStyle = projectGpuFlowDomControlPlaneHost({
          control,
          viewport,
        });
        return (
          <div
            className={GPU_FLOW_DOM_CONTROL_HOST_CLASS_NAME}
            data-gpu-flow-dom-control="true"
            data-gpu-flow-dom-control-id={control.sourceId}
            data-gpu-flow-dom-control-row-id={control.rowId}
            data-gpu-flow-dom-control-section-id={control.sectionId}
            data-gpu-flow-dom-control-surface-id={control.surfaceId}
            data-gpu-flow-dom-control-active={control.active ? "true" : "false"}
            key={control.sourceId}
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
                left: -(clip.x - control.worldRectFlowPx.x),
                position: "absolute",
                top: -(clip.y - control.worldRectFlowPx.y),
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
      })}
    </div>
  );
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
  viewport,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly viewport: GpuViewportInput;
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  const canvasSize = getGpuFlowDomControlPlaneViewportCanvasSize();
  const visibleFlowRect = getVisibleFlowRect({
    canvasHeight: canvasSize.height,
    canvasWidth: canvasSize.width,
    marginCssPx: GPU_FLOW_DOM_CONTROL_OVERSCAN_CSS_PX,
    viewport,
  });
  return controls
    .filter((control) => rectsIntersect(visibleFlowRect, control.worldRectFlowPx))
    .sort(compareGpuFlowDomControlPlaneControls);
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
  controls,
  diagnosticsRef,
  hostByControlId,
  runtimeFrameId,
  viewport,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly diagnosticsRef: MutableRefObject<DomControlPlaneDiagnostics>;
  readonly hostByControlId: ReadonlyMap<string, MountedDomControlPlaneHost>;
  readonly runtimeFrameId: number;
  readonly viewport: GpuViewportInput;
}) {
  const startedAt = performance.now();
  const canvasSize = getGpuFlowDomControlPlaneViewportCanvasSize();
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
  for (const control of controls) {
    if (control.active) {
      activeControlId = control.sourceId;
    }
    const result = syncGpuFlowDomControlPlaneControlProjection({
      control,
      hostByControlId,
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
    lastProjectionBatchDurationMs: performance.now() - startedAt,
    mountedControlCount: hostByControlId.size,
    projectionWriteCount,
    runtimeFrameId,
    visibleControlRectCount,
  };
}

function syncGpuFlowDomControlPlaneControlProjection({
  control,
  hostByControlId,
  visibleFlowRect,
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly hostByControlId: ReadonlyMap<string, MountedDomControlPlaneHost>;
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
  if (!rectsIntersect(visibleFlowRect, control.worldRectFlowPx)) {
    return {
      ...emptyGpuFlowDomControlPlaneProjectionResult(),
      projectionWriteCount: hideGpuFlowDomControlPlaneElement(host.element),
    };
  }
  const clip = getGpuFlowDomControlPlaneVisibleClip(control);
  if (clip.width <= 0 || clip.height <= 0) {
    return {
      ...emptyGpuFlowDomControlPlaneProjectionResult(),
      projectionWriteCount: hideGpuFlowDomControlPlaneElement(host.element),
    };
  }
  return {
    clippedControlCount: isGpuFlowDomControlPlaneClipPartial(control, clip)
      ? 1
      : 0,
    projectionWriteCount: syncGpuFlowDomControlPlaneElementStyle({
      control,
      element: host.element,
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

function isGpuFlowDomControlPlaneClipPartial(
  control: GpuRetainedDomControlSourceDescriptor,
  clip: GpuRect,
): boolean {
  return (
    clip.x !== control.worldRectFlowPx.x ||
    clip.y !== control.worldRectFlowPx.y ||
    clip.width !== control.worldRectFlowPx.width ||
    clip.height !== control.worldRectFlowPx.height
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
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly element: HTMLElement;
  readonly viewport: GpuViewportInput;
}): number {
  const projection = projectGpuFlowDomControlPlaneHost({
    control,
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
  return writes;
}

function projectGpuFlowDomControlPlaneHost({
  control,
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}) {
  const clip = getGpuFlowDomControlPlaneVisibleClip(control);
  const position = flowToScreenPosition(clip, viewport);
  return {
    display: clip.width > 0 && clip.height > 0 ? "" : "none",
    height: clip.height,
    left: position.x,
    pointerEvents:
      clip.width > 0 && clip.height > 0 ? ("auto" as const) : ("none" as const),
    top: position.y,
    transform: `scale(${viewport.zoom})`,
    transformOrigin: "top left",
    width: clip.width,
    zIndex: control.zOrder,
  };
}

function hideGpuFlowDomControlPlaneElement(element: HTMLElement): number {
  let writes = 0;
  writes += setStyleValue(element, "display", "none");
  writes += setStyleValue(element, "pointerEvents", "none");
  return writes;
}

function getGpuFlowDomControlPlaneVisibleClip(
  control: GpuRetainedDomControlSourceDescriptor,
): GpuRect {
  return intersectRects(control.worldRectFlowPx, control.sectionClipRectFlowPx);
}

function blurFocusedDescendantBeforeUnmount(element: HTMLElement) {
  const activeElement = element.ownerDocument.activeElement;
  if (activeElement instanceof HTMLElement && element.contains(activeElement)) {
    activeElement.blur();
  }
}

function createEmptyDomControlPlaneDiagnostics(
  runtimeFrameId: number,
): DomControlPlaneDiagnostics {
  return {
    activeControlId: null,
    clippedControlCount: 0,
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
