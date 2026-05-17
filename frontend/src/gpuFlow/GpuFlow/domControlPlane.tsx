import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuRetainedDomControlActivation,
  GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  createGpuFlowBrowserVisualActorRuntime,
  getGpuFlowBrowserVisualActorRuntimeForCommittedSurface,
  type GpuFlowBrowserVisualActorRuntime,
} from "./browserVisualActorRuntime";
import {
  projectGpuFlowDomControlPlaneGeometry,
  projectGpuFlowDomControlPlaneHost,
  type GpuFlowDomControlPlaneDiagnostics,
  type GpuFlowDomControlProjectionAssignment,
  type GpuFlowRetainedScrollOffsetGetter,
} from "./domControlPlaneProjection";
import { getLiveGpuFlowDomControlPlaneViewport } from "./domControlPlaneViewport";
export {
  filterGpuFlowDomControlPlaneMountedControls,
  resolveGpuFlowDomControlPlaneProjectionAssignments,
} from "./domControlPlaneProjection";
export type { GpuFlowRetainedScrollOffsetGetter } from "./domControlPlaneProjection";

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

const GPU_FLOW_DOM_CONTROL_PLANE_CLASS_NAME =
  "setta-gpu-flow__dom-control-plane";
const GPU_FLOW_DOM_CONTROL_HOST_CLASS_NAME = [
  "setta-gpu-flow__dom-control",
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
].join(" ");

type GpuFlowDomControlCoverageDebugAttributes = {
  readonly "data-gpu-flow-dom-control-compatibility-reason": string;
  readonly "data-gpu-flow-dom-control-coverage-reason": GpuFlowDomControlProjectionAssignment["reason"];
  readonly "data-gpu-flow-dom-control-coverage-state": GpuFlowDomControlProjectionAssignment["coverageState"];
  readonly "data-gpu-flow-dom-control-projection-phase": GpuFlowDomControlProjectionAssignment["phase"];
};

const DEFAULT_ACTIVE_DOM_CONTROL_COVERAGE_DEBUG_ATTRIBUTES: GpuFlowDomControlCoverageDebugAttributes =
  Object.freeze({
    "data-gpu-flow-dom-control-compatibility-reason": "",
    "data-gpu-flow-dom-control-coverage-reason": "active-pinned",
    "data-gpu-flow-dom-control-coverage-state": "live",
    "data-gpu-flow-dom-control-projection-phase": "project",
  });

const DEFAULT_PASSIVE_DOM_CONTROL_COVERAGE_DEBUG_ATTRIBUTES: GpuFlowDomControlCoverageDebugAttributes =
  Object.freeze({
    "data-gpu-flow-dom-control-compatibility-reason": "",
    "data-gpu-flow-dom-control-coverage-reason": "visible-live",
    "data-gpu-flow-dom-control-coverage-state": "live",
    "data-gpu-flow-dom-control-projection-phase": "project",
  });
const GPU_FLOW_ACTIVE_DOM_CONTROL_FOCUS_ATTEMPTS = 300;
const GPU_FLOW_ACTIVE_DOM_CONTROL_FOCUS_RETRY_DELAY_MS = 16;

export function GpuFlowDomControlPlane({
  committedFrameId,
  committedSurfaceRuntime,
  getRetainedScrollOffset,
  onActivate,
  renderControl,
  retainedRuntimeFrame,
  surfaceRef,
  viewportStore,
  viewportRuntime,
}: {
  readonly committedFrameId?: number | undefined;
  readonly committedSurfaceRuntime?: GpuFlowCommittedSurfaceRuntime | undefined;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly onActivate: GpuFlowDomControlActivationHandler | undefined;
  readonly renderControl: GpuFlowDomControlRenderer | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly surfaceRef?: MutableRefObject<GpuSurfaceHandle | null> | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const fallbackRuntimeRef = useRef<GpuFlowBrowserVisualActorRuntime | null>(
    null,
  );
  const projectedFrameRequestKeyRef = useRef<string>("");
  const browserVisualRuntime = useMemo(() => {
    if (committedSurfaceRuntime) {
      return getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
        committedSurfaceRuntime,
      );
    }
    fallbackRuntimeRef.current ??= createGpuFlowBrowserVisualActorRuntime();
    return fallbackRuntimeRef.current;
  }, [committedSurfaceRuntime]);
  const snapshot = useSyncExternalStore(
    browserVisualRuntime.subscribe.bind(browserVisualRuntime),
    browserVisualRuntime.getSnapshot.bind(browserVisualRuntime),
    browserVisualRuntime.getSnapshot.bind(browserVisualRuntime),
  );
  const frameIds = snapshot.frameIds;
  const frameIdsRef = useRef(frameIds);
  frameIdsRef.current = frameIds;
  const controlsToMount = snapshot.domControls.mountedControls;
  const assignmentsToMount = snapshot.domControls.assignments;
  const assignmentByControlId = useMemo(
    () =>
      new Map(
        assignmentsToMount.map((assignment) => [
          assignment.control.sourceId,
          assignment,
        ]),
      ),
    [assignmentsToMount],
  );

  const setControlElement = useCallback(
    (
      control: GpuRetainedDomControlSourceDescriptor,
      element: HTMLElement | null,
    ) => {
      const currentFrameIds = frameIdsRef.current;
      const finishMeasure = startGpuFlowPerformanceMeasure(
        "dom-control-host-assignment",
        {
          committedFrameId: currentFrameIds.committedFrameId,
          controlId: control.sourceId,
          runtimeFrameId: currentFrameIds.runtimeFrameId,
        },
      );
      try {
        browserVisualRuntime.setDomControlElement({
          control,
          element,
        });
        if (element) {
          surfaceRef?.current?.requestFrame("texture-upload");
        }
      } finally {
        finishMeasure();
      }
    },
    [browserVisualRuntime, surfaceRef],
  );
  const setControlCompositionActive = useCallback(
    (controlId: string, active: boolean) => {
      browserVisualRuntime.setDomControlCompositionActive({
        active,
        controlId,
      });
    },
    [browserVisualRuntime],
  );

  useLayoutEffect(() => {
    browserVisualRuntime.setCommittedSurfaceSource({
      committedFrameId,
      committedSurfaceRuntime,
      retainedRuntimeFrame,
    });
  }, [
    browserVisualRuntime,
    committedFrameId,
    committedSurfaceRuntime,
    retainedRuntimeFrame,
  ]);

  useLayoutEffect(() => {
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset,
      viewportRuntime,
      viewportStore,
    });
  }, [
    browserVisualRuntime,
    getRetainedScrollOffset,
    viewportRuntime,
    viewportStore,
  ]);

  useLayoutEffect(() => {
    browserVisualRuntime.setSuspendPassivePointerActivation(
      viewportStore.getState().zoomActivationKeyPressed,
    );
    return viewportStore.subscribe((state, previousState) => {
      if (
        state.zoomActivationKeyPressed ===
        previousState.zoomActivationKeyPressed
      ) {
        return;
      }
      browserVisualRuntime.setSuspendPassivePointerActivation(
        state.zoomActivationKeyPressed,
      );
    });
  }, [browserVisualRuntime, viewportStore]);

  useLayoutEffect(() => {
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        const finishMeasure = startGpuFlowPerformanceMeasure(
          "dom-control-projection",
          {
            committedFrameId: frameIds.committedFrameId,
            hostCount: controlsToMount.length,
            runtimeFrameId: frameIds.runtimeFrameId,
          },
        );
        try {
          browserVisualRuntime.projectDomControls(viewport);
        } finally {
          finishMeasure();
        }
      },
    });
  }, [browserVisualRuntime, controlsToMount.length, frameIds, viewportRuntime]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      const finishMeasure = startGpuFlowPerformanceMeasure(
        "dom-control-projection",
        {
          committedFrameId: frameIds.committedFrameId,
          hostCount: controlsToMount.length,
          runtimeFrameId: frameIds.runtimeFrameId,
        },
      );
      try {
        browserVisualRuntime.projectDomControls(state.transform);
      } finally {
        finishMeasure();
      }
    });
  }, [browserVisualRuntime, controlsToMount.length, frameIds, viewportStore]);

  useLayoutEffect(() => {
    const projectionFrameKey = [
      frameIds.committedFrameId,
      frameIds.runtimeFrameId,
      controlsToMount.length,
      snapshot.domControls.sourceRevision,
    ].join(":");
    const finishMeasure = startGpuFlowPerformanceMeasure(
      "dom-control-projection",
      {
        committedFrameId: frameIds.committedFrameId,
        hostCount: controlsToMount.length,
        runtimeFrameId: frameIds.runtimeFrameId,
      },
    );
    try {
      browserVisualRuntime.projectDomControls();
      if (
        controlsToMount.length > 0 &&
        projectedFrameRequestKeyRef.current !== projectionFrameKey
      ) {
        projectedFrameRequestKeyRef.current = projectionFrameKey;
        surfaceRef?.current?.requestFrame("texture-upload");
      }
    } finally {
      finishMeasure();
    }
  }, [
    browserVisualRuntime,
    controlsToMount.length,
    frameIds,
    snapshot.domControls.sourceRevision,
    surfaceRef,
  ]);

  useLayoutEffect(() => {
    const view = window as typeof window & {
      __settaGpuFlowDomControlPlaneDiagnostics?: () => GpuFlowDomControlPlaneDiagnostics;
    };
    view.__settaGpuFlowDomControlPlaneDiagnostics = () => ({
      ...browserVisualRuntime.getDomControlDiagnostics(),
    });
    return () => {
      if (view.__settaGpuFlowDomControlPlaneDiagnostics) {
        delete view.__settaGpuFlowDomControlPlaneDiagnostics;
      }
    };
  }, [browserVisualRuntime]);

  if (!renderControl) {
    return null;
  }

  const viewport = normalizeGpuViewport(
    getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime, viewportStore }),
  );
  const suspendPassivePointerActivation =
    viewportStore.getState().zoomActivationKeyPressed;
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
          suspendPassivePointerActivation,
          viewport,
        });
        const assignment = assignmentByControlId.get(control.sourceId);
        return (
          <GpuFlowDomControlHost
            assignment={assignment}
            control={control}
            getRetainedScrollOffset={getRetainedScrollOffset}
            initialStyle={initialStyle}
            key={control.sourceId}
            onActivate={onActivate}
            renderControl={renderControl}
            setControlCompositionActive={setControlCompositionActive}
            setControlElement={setControlElement}
          />
        );
      })}
    </div>
  );
}

function GpuFlowDomControlHost({
  assignment,
  control,
  getRetainedScrollOffset,
  initialStyle,
  onActivate,
  renderControl,
  setControlCompositionActive,
  setControlElement,
}: {
  readonly assignment: GpuFlowDomControlProjectionAssignment | undefined;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly initialStyle: ReturnType<typeof projectGpuFlowDomControlPlaneHost>;
  readonly onActivate: GpuFlowDomControlActivationHandler | undefined;
  readonly renderControl: GpuFlowDomControlRenderer;
  readonly setControlCompositionActive: (
    controlId: string,
    active: boolean,
  ) => void;
  readonly setControlElement: (
    control: GpuRetainedDomControlSourceDescriptor,
    element: HTMLElement | null,
  ) => void;
}) {
  const hostElementRef = useRef<HTMLDivElement | null>(null);
  const latestControlRef = useRef(control);
  const registeredControlRef =
    useRef<GpuRetainedDomControlSourceDescriptor | null>(null);
  latestControlRef.current = control;
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  const clip = geometry.visibleClipFlowPx;
  const coverageDebugAttributes = getGpuFlowDomControlCoverageDebugAttributes({
    assignment,
    active: control.active,
  });
  const setHostElement = useCallback(
    (element: HTMLDivElement | null) => {
      hostElementRef.current = element;
      if (element) {
        const nextControl = latestControlRef.current;
        registeredControlRef.current = nextControl;
        setControlElement(nextControl, element);
        return;
      }
      const previousControl =
        registeredControlRef.current ?? latestControlRef.current;
      registeredControlRef.current = null;
      setControlElement(previousControl, null);
    },
    [setControlElement],
  );

  useLayoutEffect(() => {
    const element = hostElementRef.current;
    if (!element || registeredControlRef.current === control) {
      return;
    }
    registeredControlRef.current = control;
    setControlElement(control, element);
  }, [control, setControlElement]);

  useLayoutEffect(() => {
    if (!control.active) {
      return;
    }
    let timeoutId: number | null = null;
    let attemptCount = 0;
    const scheduleNextFocusAttempt = () => {
      if (attemptCount >= GPU_FLOW_ACTIVE_DOM_CONTROL_FOCUS_ATTEMPTS) {
        return;
      }
      timeoutId = window.setTimeout(
        focusActiveEditor,
        GPU_FLOW_ACTIVE_DOM_CONTROL_FOCUS_RETRY_DELAY_MS,
      );
    };
    const focusActiveEditor = () => {
      timeoutId = null;
      attemptCount += 1;
      const element = hostElementRef.current;
      if (!element?.isConnected) {
        scheduleNextFocusAttempt();
        return;
      }
      if (!hasGpuFlowDomControlEditorFocus(element)) {
        focusGpuFlowDomControlEditor(element);
      }
      if (!hasGpuFlowDomControlEditorFocus(element)) {
        scheduleNextFocusAttempt();
      }
    };
    focusActiveEditor();
    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [control.active, control.sourceId, control.sourceKey]);

  return (
    <div
      aria-hidden={
        control.visualSemantics.accessibility === "visual-only-aria-hidden"
          ? true
          : undefined
      }
      className={GPU_FLOW_DOM_CONTROL_HOST_CLASS_NAME}
      data-gpu-flow-dom-control="true"
      data-gpu-flow-dom-control-id={control.sourceId}
      data-gpu-flow-dom-control-focusable={
        control.visualSemantics.focusable ? "true" : "false"
      }
      data-gpu-flow-dom-control-pointer-semantics={
        control.visualSemantics.pointer
      }
      data-gpu-flow-dom-control-row-id={control.rowId}
      data-gpu-flow-dom-control-selectable={control.visualSemantics.selectable}
      data-gpu-flow-dom-control-section-id={control.sectionId}
      data-gpu-flow-dom-control-surface-id={control.surfaceId}
      data-gpu-flow-dom-control-active={control.active ? "true" : "false"}
      {...coverageDebugAttributes}
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
      onCompositionEndCapture={() => {
        setControlCompositionActive(control.sourceId, false);
      }}
      onCompositionStartCapture={() => {
        setControlCompositionActive(control.sourceId, true);
      }}
      ref={setHostElement}
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

function getGpuFlowDomControlCoverageDebugAttributes({
  active,
  assignment,
}: {
  readonly active: boolean;
  readonly assignment: GpuFlowDomControlProjectionAssignment | undefined;
}): GpuFlowDomControlCoverageDebugAttributes {
  if (!assignment) {
    return active
      ? DEFAULT_ACTIVE_DOM_CONTROL_COVERAGE_DEBUG_ATTRIBUTES
      : DEFAULT_PASSIVE_DOM_CONTROL_COVERAGE_DEBUG_ATTRIBUTES;
  }
  const compatibilityProof = assignment.compatibilityProof;
  return {
    "data-gpu-flow-dom-control-compatibility-reason": compatibilityProof
      ? compatibilityProof.reasonCode
      : "",
    "data-gpu-flow-dom-control-coverage-reason": assignment.reason,
    "data-gpu-flow-dom-control-coverage-state": assignment.coverageState,
    "data-gpu-flow-dom-control-projection-phase": assignment.phase,
  };
}

function hasGpuFlowDomControlEditorFocus(element: HTMLElement): boolean {
  const activeElement = element.ownerDocument.activeElement;
  if (
    !(activeElement instanceof HTMLElement) ||
    !element.contains(activeElement)
  ) {
    return false;
  }
  const control = activeElement.closest<HTMLElement>("[data-gpu-flow-control]");
  if (!control) {
    return false;
  }
  const codeMirrorContent = control.querySelector<HTMLElement>(
    ".cm-content[contenteditable='true']",
  );
  return codeMirrorContent
    ? codeMirrorContent === activeElement ||
        codeMirrorContent.contains(activeElement)
    : true;
}

function focusGpuFlowDomControlEditor(element: HTMLElement): void {
  const control = getGpuFlowDomControlEditorFocusTarget(element);
  control?.focus({ preventScroll: true });
}

function getGpuFlowDomControlEditorFocusTarget(
  element: HTMLElement,
): HTMLElement | null {
  const control = element.querySelector<HTMLElement>("[data-gpu-flow-control]");
  return (
    control?.querySelector<HTMLElement>(
      ".cm-content[contenteditable='true']",
    ) ?? control
  );
}
