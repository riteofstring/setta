import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
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
export type {
  GpuFlowDomControlProjectionAssignment,
  GpuFlowRetainedScrollOffsetGetter,
} from "./domControlPlaneProjection";

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

export function GpuFlowDomControlPlane({
  committedFrameId,
  committedSurfaceRuntime,
  getRetainedScrollOffset,
  onActivate,
  renderControl,
  retainedRuntimeFrame,
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
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const fallbackRuntimeRef = useRef<GpuFlowBrowserVisualActorRuntime | null>(
    null,
  );
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
      const finishMeasure = startGpuFlowPerformanceMeasure(
        "dom-control-host-assignment",
        {
          committedFrameId: frameIds.committedFrameId,
          controlId: control.sourceId,
          runtimeFrameId: frameIds.runtimeFrameId,
        },
      );
      try {
        browserVisualRuntime.setDomControlElement({
          control,
          element,
        });
      } finally {
        finishMeasure();
      }
    },
    [browserVisualRuntime, frameIds.committedFrameId, frameIds.runtimeFrameId],
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
    } finally {
      finishMeasure();
    }
  }, [browserVisualRuntime, controlsToMount.length, frameIds]);

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
  readonly setControlElement: (
    control: GpuRetainedDomControlSourceDescriptor,
    element: HTMLElement | null,
  ) => void;
}) {
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  const clip = geometry.visibleClipFlowPx;
  const coverageDebugAttributes = getGpuFlowDomControlCoverageDebugAttributes({
    assignment,
    active: control.active,
  });
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
      ref={(element) => setControlElement(control, element)}
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
