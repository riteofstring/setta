import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import { useGpuFlowCommittedSurfaceLayerFrame } from "./committedSurfaceLayerFrame";
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
const GPU_FLOW_DOM_CONTROL_HOST_RETAINED_PREVIOUS_LIMIT = 64;
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
  const committedSurfaceFrame = useGpuFlowCommittedSurfaceLayerFrame(
    committedSurfaceRuntime,
  );
  const layerCommittedFrameId =
    committedSurfaceFrame?.displayFrameId ?? committedFrameId;
  const layerRetainedRuntimeFrame =
    committedSurfaceFrame?.retainedRuntimeFrame ?? retainedRuntimeFrame;
  const frameIds = useMemo(
    () =>
      resolveGpuFlowDomControlPlaneFrameIds({
        committedFrameId: layerCommittedFrameId,
        retainedRuntimeFrame: layerRetainedRuntimeFrame,
      }),
    [layerCommittedFrameId, layerRetainedRuntimeFrame],
  );
  const hostByControlIdRef = useRef(
    new Map<string, GpuFlowDomControlPlaneMountedHost>(),
  );
  const projectionManagerRef = useRef(
    createGpuFlowDomControlProjectionManager(),
  );
  const controls = useMemo(
    () =>
      layerRetainedRuntimeFrame?.descriptors.domControlSources ??
      EMPTY_DOM_CONTROL_DESCRIPTORS,
    [layerRetainedRuntimeFrame],
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
  const [suspendPassivePointerActivation, setSuspendPassivePointerActivation] =
    useState(() => viewportStore.getState().zoomActivationKeyPressed);

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
  const retainedScrollProjectionSignatureRef = useRef("");
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
        return {
          assignments: nextProjectedControls.assignments,
          controls: mergeGpuFlowDomControlProjectedControls({
            controlById: controlByIdRef.current,
            currentControls,
            nextControls: nextProjectedControls.controls,
          }),
          sourceRevision: projectionSourceRevision,
        };
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
    (
      control: GpuRetainedDomControlSourceDescriptor,
      element: HTMLElement | null,
    ) => {
      const controlId = control.sourceId;
      if (!element) {
        const mounted = hostByControlIdRef.current.get(controlId);
        if (mounted) {
          blurFocusedDescendantBeforeUnmount(mounted.element);
        }
        hostByControlIdRef.current.delete(controlId);
        return;
      }
      hostByControlIdRef.current.set(controlId, {
        control,
        controlId,
        element,
      });
      const finishMeasure = startGpuFlowPerformanceMeasure(
        "dom-control-host-assignment",
        {
          committedFrameId: frameIds.committedFrameId,
          controlId,
          runtimeFrameId: frameIds.runtimeFrameId,
        },
      );
      try {
        syncGpuFlowDomControlPlaneElementStyle({
          control,
          element,
          getRetainedScrollOffset,
          suspendPassivePointerActivation,
          viewport: getLiveGpuFlowDomControlPlaneViewport({
            viewportRuntime,
            viewportStore,
          }),
        });
      } finally {
        finishMeasure();
      }
    },
    [
      frameIds.committedFrameId,
      frameIds.runtimeFrameId,
      getRetainedScrollOffset,
      suspendPassivePointerActivation,
      viewportRuntime,
      viewportStore,
    ],
  );

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (
        state.zoomActivationKeyPressed ===
        previousState.zoomActivationKeyPressed
      ) {
        return;
      }
      setSuspendPassivePointerActivation(state.zoomActivationKeyPressed);
    });
  }, [viewportStore]);

  useLayoutEffect(() => {
    retainedScrollProjectionSignatureRef.current =
      createGpuFlowDomControlRetainedScrollProjectionSignature({
        controls,
        getRetainedScrollOffset,
      });
    refreshProjectedControls();
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        const retainedScrollProjectionSignature =
          createGpuFlowDomControlRetainedScrollProjectionSignature({
            controls,
            getRetainedScrollOffset,
          });
        if (
          retainedScrollProjectionSignature !==
          retainedScrollProjectionSignatureRef.current
        ) {
          retainedScrollProjectionSignatureRef.current =
            retainedScrollProjectionSignature;
          refreshProjectedControls(viewport);
        }
        const finishMeasure = startGpuFlowPerformanceMeasure(
          "dom-control-projection",
          {
            committedFrameId: frameIds.committedFrameId,
            hostCount: hostByControlIdRef.current.size,
            runtimeFrameId: frameIds.runtimeFrameId,
          },
        );
        try {
          projectionManagerRef.current.project({
            committedFrameId: frameIds.committedFrameId,
            controlById: controlByIdRef.current,
            diagnosticsRef,
            getRetainedScrollOffset,
            hostByControlId: hostByControlIdRef.current,
            runtimeFrameId: frameIds.runtimeFrameId,
            suspendPassivePointerActivation,
            viewport,
            viewportSize: getGpuFlowDomControlPlaneViewportSize({
              viewportStore,
            }),
          });
        } finally {
          finishMeasure();
        }
      },
    });
  }, [
    controls,
    frameIds,
    getRetainedScrollOffset,
    refreshProjectedControls,
    suspendPassivePointerActivation,
    viewportRuntime,
    viewportStore,
  ]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      const finishMeasure = startGpuFlowPerformanceMeasure(
        "dom-control-projection",
        {
          committedFrameId: frameIds.committedFrameId,
          hostCount: hostByControlIdRef.current.size,
          runtimeFrameId: frameIds.runtimeFrameId,
        },
      );
      try {
        projectionManagerRef.current.project({
          committedFrameId: frameIds.committedFrameId,
          controlById: controlByIdRef.current,
          diagnosticsRef,
          getRetainedScrollOffset,
          hostByControlId: hostByControlIdRef.current,
          runtimeFrameId: frameIds.runtimeFrameId,
          suspendPassivePointerActivation,
          viewport: state.transform,
          viewportSize: {
            height: state.height,
            width: state.width,
          },
        });
      } finally {
        finishMeasure();
      }
    });
  }, [
    frameIds,
    getRetainedScrollOffset,
    suspendPassivePointerActivation,
    viewportStore,
  ]);

  useLayoutEffect(() => {
    refreshProjectedControls();
    const finishMeasure = startGpuFlowPerformanceMeasure(
      "dom-control-projection",
      {
        committedFrameId: frameIds.committedFrameId,
        hostCount: hostByControlIdRef.current.size,
        runtimeFrameId: frameIds.runtimeFrameId,
      },
    );
    try {
      projectionManagerRef.current.project({
        committedFrameId: frameIds.committedFrameId,
        controlById,
        diagnosticsRef,
        getRetainedScrollOffset,
        hostByControlId: hostByControlIdRef.current,
        runtimeFrameId: frameIds.runtimeFrameId,
        suspendPassivePointerActivation,
        viewport: getLiveGpuFlowDomControlPlaneViewport({
          viewportRuntime,
          viewportStore,
        }),
        viewportSize: getGpuFlowDomControlPlaneViewportSize({
          viewportStore,
        }),
      });
    } finally {
      finishMeasure();
    }
  }, [
    controlById,
    frameIds,
    getRetainedScrollOffset,
    refreshProjectedControls,
    suspendPassivePointerActivation,
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

function mergeGpuFlowDomControlProjectedControls({
  controlById,
  currentControls,
  nextControls,
}: {
  readonly controlById: ReadonlyMap<
    string,
    GpuRetainedDomControlSourceDescriptor
  >;
  readonly currentControls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly nextControls: readonly GpuRetainedDomControlSourceDescriptor[];
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  if (currentControls.length === 0) {
    return nextControls;
  }
  const merged: GpuRetainedDomControlSourceDescriptor[] = [];
  const seen = new Set<string>();
  for (const control of nextControls) {
    merged.push(control);
    seen.add(control.sourceId);
  }
  for (const previousControl of currentControls) {
    if (merged.length >= GPU_FLOW_DOM_CONTROL_HOST_RETAINED_PREVIOUS_LIMIT) {
      break;
    }
    if (seen.has(previousControl.sourceId)) {
      continue;
    }
    const currentControl = controlById.get(previousControl.sourceId);
    if (!currentControl) {
      continue;
    }
    const retainedControl = canRetainPreviousGpuFlowDomControlDescriptor({
      currentControl,
      previousControl,
    })
      ? previousControl
      : currentControl;
    merged.push(retainedControl);
    seen.add(retainedControl.sourceId);
  }
  return merged;
}

function canRetainPreviousGpuFlowDomControlDescriptor({
  currentControl,
  previousControl,
}: {
  readonly currentControl: GpuRetainedDomControlSourceDescriptor;
  readonly previousControl: GpuRetainedDomControlSourceDescriptor;
}): boolean {
  return (
    currentControl.sourceKey === previousControl.sourceKey &&
    currentControl.snapshotCacheKeyRevision ===
      previousControl.snapshotCacheKeyRevision &&
    currentControl.active === previousControl.active
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

function createGpuFlowDomControlRetainedScrollProjectionSignature({
  controls,
  getRetainedScrollOffset,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
}): string {
  if (!getRetainedScrollOffset) {
    return "";
  }
  const surfaceIds = [
    ...new Set(controls.map((control) => control.surfaceId)),
  ].sort((left, right) => left.localeCompare(right));
  return JSON.stringify(
    surfaceIds.map((surfaceId) => {
      const offset = getRetainedScrollOffset(surfaceId);
      return [surfaceId, offset?.x ?? null, offset?.y ?? null];
    }),
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
