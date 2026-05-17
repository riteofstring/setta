import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import type {
  GpuRetainedDomControlActivation,
  GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  createEmptyDomControlPlaneDiagnostics,
  createGpuFlowDomControlProjectionManager,
  projectGpuFlowDomControlPlaneGeometry,
  projectGpuFlowDomControlPlaneHost,
  syncGpuFlowDomControlPlaneElementStyle,
  type GpuFlowDomControlPlaneDiagnostics,
  type GpuFlowDomControlPlaneMountedHost,
  type GpuFlowDomControlProjectionAssignment,
  type GpuFlowRetainedScrollOffsetGetter,
} from "./domControlPlaneProjection";
import {
  getGpuFlowDomControlPlaneViewportSize,
  getLiveGpuFlowDomControlPlaneViewport,
} from "./domControlPlaneViewport";
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
const EMPTY_DOM_CONTROL_DESCRIPTORS: readonly GpuRetainedDomControlSourceDescriptor[] =
  [];

type GpuFlowDomControlProjectedControls = {
  readonly assignments: readonly GpuFlowDomControlProjectionAssignment[];
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly sourceRevision: string;
};

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
  getRetainedScrollOffset,
  onActivate,
  renderControl,
  retainedRuntimeFrame,
  viewportStore,
  viewportRuntime,
}: {
  readonly committedFrameId?: number | undefined;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
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
    new Map<string, GpuFlowDomControlPlaneMountedHost>(),
  );
  const projectionManagerRef = useRef(
    createGpuFlowDomControlProjectionManager(),
  );
  const controls = useMemo(
    () =>
      retainedRuntimeFrame?.descriptors.domControlSources ??
      EMPTY_DOM_CONTROL_DESCRIPTORS,
    [retainedRuntimeFrame],
  );
  const projectionSourceRevision = useMemo(
    () =>
      createGpuFlowDomControlProjectionSourceRevision({
        controls,
        frameIds,
      }),
    [controls, frameIds],
  );
  const diagnosticsRef = useRef<GpuFlowDomControlPlaneDiagnostics>(
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
  const initialControlsToMount = useMemo(
    () =>
      resolveGpuFlowDomControlProjectedControls({
        controls,
        getRetainedScrollOffset,
        projectionManager: projectionManagerRef.current,
        sourceRevision: projectionSourceRevision,
        viewport: getLiveGpuFlowDomControlPlaneViewport({
          viewportRuntime,
          viewportStore,
        }),
        viewportSize: getGpuFlowDomControlPlaneViewportSize({
          viewportStore,
        }),
      }),
    [
      controls,
      getRetainedScrollOffset,
      projectionSourceRevision,
      viewportRuntime,
      viewportStore,
    ],
  );
  const [projectedControls, setProjectedControls] =
    useState<GpuFlowDomControlProjectedControls>(initialControlsToMount);
  const controlsToMount =
    projectedControls.sourceRevision === projectionSourceRevision
      ? projectedControls.controls
      : initialControlsToMount.controls;
  const assignmentsToMount =
    projectedControls.sourceRevision === projectionSourceRevision
      ? projectedControls.assignments
      : initialControlsToMount.assignments;
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
  const controlsToMountRef = useRef(controlsToMount);
  controlsToMountRef.current = controlsToMount;
  const refreshProjectedControls = useCallback(
    (
      viewport = getLiveGpuFlowDomControlPlaneViewport({
        viewportRuntime,
        viewportStore,
      }),
    ) => {
      const nextProjectedControls = resolveGpuFlowDomControlProjectedControls({
        controls,
        getRetainedScrollOffset,
        projectionManager: projectionManagerRef.current,
        sourceRevision: projectionSourceRevision,
        viewport,
        viewportSize: getGpuFlowDomControlPlaneViewportSize({
          viewportStore,
        }),
      });
      setProjectedControls((current) => {
        const currentControls =
          current.sourceRevision === projectionSourceRevision
            ? current.controls
            : controlsToMountRef.current;
        if (
          current.sourceRevision === projectionSourceRevision &&
          areGpuFlowDomControlProjectedControlsEqual({
            leftAssignments: current.assignments,
            leftControls: currentControls,
            rightAssignments: nextProjectedControls.assignments,
            rightControls: nextProjectedControls.controls,
          })
        ) {
          return current;
        }
        if (
          areGpuFlowDomControlProjectedControlsEqual({
            leftAssignments: current.assignments,
            leftControls: currentControls,
            rightAssignments: nextProjectedControls.assignments,
            rightControls: nextProjectedControls.controls,
          })
        ) {
          return {
            assignments: nextProjectedControls.assignments,
            controls: currentControls,
            sourceRevision: projectionSourceRevision,
          };
        }
        return nextProjectedControls;
      });
    },
    [
      controls,
      getRetainedScrollOffset,
      projectionSourceRevision,
      viewportRuntime,
      viewportStore,
    ],
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
        viewport: getLiveGpuFlowDomControlPlaneViewport({
          viewportRuntime,
          viewportStore,
        }),
      });
    },
    [controlById, getRetainedScrollOffset, viewportRuntime, viewportStore],
  );

  useLayoutEffect(() => {
    refreshProjectedControls();
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        projectionManagerRef.current.project({
          committedFrameId: frameIds.committedFrameId,
          controlById: controlByIdRef.current,
          diagnosticsRef,
          getRetainedScrollOffset,
          hostByControlId: hostByControlIdRef.current,
          runtimeFrameId: frameIds.runtimeFrameId,
          viewport,
          viewportSize: getGpuFlowDomControlPlaneViewportSize({
            viewportStore,
          }),
        });
      },
    });
  }, [
    frameIds,
    getRetainedScrollOffset,
    refreshProjectedControls,
    viewportRuntime,
    viewportStore,
  ]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      projectionManagerRef.current.project({
        committedFrameId: frameIds.committedFrameId,
        controlById: controlByIdRef.current,
        diagnosticsRef,
        getRetainedScrollOffset,
        hostByControlId: hostByControlIdRef.current,
        runtimeFrameId: frameIds.runtimeFrameId,
        viewport: state.transform,
        viewportSize: {
          height: state.height,
          width: state.width,
        },
      });
    });
  }, [frameIds, getRetainedScrollOffset, viewportStore]);

  useLayoutEffect(() => {
    refreshProjectedControls();
    projectionManagerRef.current.project({
      committedFrameId: frameIds.committedFrameId,
      controlById,
      diagnosticsRef,
      getRetainedScrollOffset,
      hostByControlId: hostByControlIdRef.current,
      runtimeFrameId: frameIds.runtimeFrameId,
      viewport: getLiveGpuFlowDomControlPlaneViewport({
        viewportRuntime,
        viewportStore,
      }),
      viewportSize: getGpuFlowDomControlPlaneViewportSize({
        viewportStore,
      }),
    });
  }, [
    controlById,
    frameIds,
    getRetainedScrollOffset,
    refreshProjectedControls,
    viewportRuntime,
    viewportStore,
  ]);

  useLayoutEffect(() => {
    const view = window as typeof window & {
      __settaGpuFlowDomControlPlaneDiagnostics?: () => GpuFlowDomControlPlaneDiagnostics;
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
    getLiveGpuFlowDomControlPlaneViewport({ viewportRuntime, viewportStore }),
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
    controlId: string,
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

function resolveGpuFlowDomControlProjectedControls({
  controls,
  getRetainedScrollOffset,
  projectionManager,
  sourceRevision,
  viewport,
  viewportSize,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly projectionManager: ReturnType<
    typeof createGpuFlowDomControlProjectionManager
  >;
  readonly sourceRevision: string;
  readonly viewport: Parameters<
    ReturnType<typeof createGpuFlowDomControlProjectionManager>["prepare"]
  >[0]["viewport"];
  readonly viewportSize: Parameters<
    ReturnType<typeof createGpuFlowDomControlProjectionManager>["prepare"]
  >[0]["viewportSize"];
}): GpuFlowDomControlProjectedControls {
  const assignments = projectionManager.prepare({
    controls,
    getRetainedScrollOffset,
    viewport,
    viewportSize,
  });
  return {
    assignments,
    controls: projectionManager.promote(assignments),
    sourceRevision,
  };
}

function createGpuFlowDomControlProjectionSourceRevision({
  controls,
  frameIds,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly frameIds: {
    readonly committedFrameId: number;
    readonly runtimeFrameId: number;
  };
}): string {
  return JSON.stringify({
    committedFrameId: frameIds.committedFrameId,
    controls: controls.map((control) => [
      control.sourceId,
      control.sourceKey,
      control.active,
      control.visualPolicy,
      control.sectionScrollRevision,
      control.viewportSampleRevision,
    ]),
    runtimeFrameId: frameIds.runtimeFrameId,
  });
}

function areGpuFlowDomControlProjectedControlsEqual({
  leftAssignments,
  leftControls,
  rightAssignments,
  rightControls,
}: {
  readonly leftAssignments: readonly GpuFlowDomControlProjectionAssignment[];
  readonly leftControls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly rightAssignments: readonly GpuFlowDomControlProjectionAssignment[];
  readonly rightControls: readonly GpuRetainedDomControlSourceDescriptor[];
}): boolean {
  if (leftControls.length !== rightControls.length) {
    return false;
  }
  const leftAssignmentByControlId =
    createGpuFlowDomControlProjectionAssignmentMap(leftAssignments);
  const rightAssignmentByControlId =
    createGpuFlowDomControlProjectionAssignmentMap(rightAssignments);
  return leftControls.every(
    (control, index) =>
      control.sourceId === rightControls[index]?.sourceId &&
      areGpuFlowDomControlProjectionAssignmentsEqual(
        leftAssignmentByControlId.get(control.sourceId),
        rightAssignmentByControlId.get(control.sourceId),
      ),
  );
}

function createGpuFlowDomControlProjectionAssignmentMap(
  assignments: readonly GpuFlowDomControlProjectionAssignment[],
): ReadonlyMap<string, GpuFlowDomControlProjectionAssignment> {
  return new Map(
    assignments.map((assignment) => [assignment.control.sourceId, assignment]),
  );
}

function areGpuFlowDomControlProjectionAssignmentsEqual(
  left: GpuFlowDomControlProjectionAssignment | undefined,
  right: GpuFlowDomControlProjectionAssignment | undefined,
): boolean {
  return (
    createGpuFlowDomControlProjectionAssignmentEqualityKey(left) ===
    createGpuFlowDomControlProjectionAssignmentEqualityKey(right)
  );
}

function createGpuFlowDomControlProjectionAssignmentEqualityKey(
  assignment: GpuFlowDomControlProjectionAssignment | undefined,
): string {
  if (!assignment) {
    return "";
  }
  const compatibilityProof = assignment.compatibilityProof;
  return JSON.stringify([
    assignment.coverageState,
    assignment.phase,
    assignment.reason,
    compatibilityProof ? compatibilityProof.reasonCode : "",
  ]);
}

function blurFocusedDescendantBeforeUnmount(element: HTMLElement) {
  const activeElement = element.ownerDocument.activeElement;
  if (activeElement instanceof HTMLElement && element.contains(activeElement)) {
    activeElement.blur();
  }
}
