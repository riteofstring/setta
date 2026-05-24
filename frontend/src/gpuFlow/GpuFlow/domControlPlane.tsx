import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import { getGpuFlowVisibleFrameIdentityDataAttributes } from "./visibleFrameIdentityAttributes";
import type { GpuFlowCommitPublicationToken } from "./visibleFramePresentationProofs";
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
    readonly hostPresentation?:
      | "preparation"
      | "snapshot-source"
      | "visible"
      | undefined;
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
  committedSurfaceRuntime,
  getRetainedScrollOffset,
  onActivate,
  renderControl,
  surfaceRef,
  viewportStore,
  viewportRuntime,
}: {
  readonly committedSurfaceRuntime?: GpuFlowCommittedSurfaceRuntime | undefined;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly onActivate: GpuFlowDomControlActivationHandler | undefined;
  readonly renderControl: GpuFlowDomControlRenderer | undefined;
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
  const [preparationSnapshot, setPreparationSnapshot] = useState(() =>
    browserVisualRuntime.getPreparationSnapshot(),
  );
  const frameIds = snapshot.frameIds;
  const publicationToken = snapshot.publicationToken;
  const frameIdsRef = useRef(frameIds);
  frameIdsRef.current = frameIds;
  const controlsToMount = snapshot.domControls.mountedControls;
  const activeControlsToMount = useMemo(
    () => controlsToMount.filter((control) => control.active),
    [controlsToMount],
  );
  const visibleControlIds = useMemo(
    () => new Set(controlsToMount.map((control) => control.sourceId)),
    [controlsToMount],
  );
  const preparationControlsToMount = useMemo(
    () =>
      preparationSnapshot.domControls.mountedControls.filter((control) =>
        isGpuFlowDomControlPreparationHostRequired({
          control,
          visibleControlById: snapshot.domControls.controlById,
          visibleControlIds,
        }),
      ),
    [preparationSnapshot, snapshot.domControls.controlById, visibleControlIds],
  );
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
      presentation: "preparation" | "visible",
      token: GpuFlowCommitPublicationToken | null,
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
          presentation,
          ...(token === null ? {} : { token }),
        });
        requestGpuFlowDomControlHostFrameIfNeeded({
          browserVisualRuntime,
          control,
          element,
          presentation,
          surfaceRef,
        });
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
    browserVisualRuntime.setDomControlPreparationHostRenderer(
      setPreparationSnapshot,
    );
    return () => {
      browserVisualRuntime.setDomControlPreparationHostRenderer(null);
    };
  }, [browserVisualRuntime]);

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
      applyViewport() {
        const finishMeasure = startGpuFlowPerformanceMeasure(
          "dom-control-projection",
          {
            committedFrameId: frameIds.committedFrameId,
            hostCount: controlsToMount.length,
            runtimeFrameId: frameIds.runtimeFrameId,
          },
        );
        try {
          browserVisualRuntime.getDomControlDiagnostics();
        } finally {
          finishMeasure();
        }
      },
    });
  }, [browserVisualRuntime, controlsToMount.length, frameIds, viewportRuntime]);

  useLayoutEffect(() => {
    const projectionFrameKey = [
      frameIds.committedFrameId,
      frameIds.runtimeFrameId,
      activeControlsToMount.length,
      snapshot.domControls.sourceRevision,
    ].join(":");
    if (
      activeControlsToMount.length > 0 &&
      projectedFrameRequestKeyRef.current !== projectionFrameKey
    ) {
      projectedFrameRequestKeyRef.current = projectionFrameKey;
      browserVisualRuntime.requestCommittedBrowserVisualRepairFrame({
        surface: surfaceRef?.current,
      });
    }
  }, [
    browserVisualRuntime,
    activeControlsToMount.length,
    frameIds,
    snapshot.domControls.sourceRevision,
    surfaceRef,
  ]);

  useLayoutEffect(() => {
    const view = window as typeof window & {
      __settaGpuFlowBrowserVisualPreparationDiagnostics?: (
        actorId?: string | null,
      ) => {
        readonly preparationAssignment: {
          readonly coverageState: string;
          readonly phase: string;
          readonly priority: number;
          readonly reason: string;
          readonly sourceId: string;
          readonly textCoverageState: GpuRetainedDomControlSourceDescriptor["textCoverageState"];
          readonly visualPolicy: string;
        } | null;
        readonly preparationAssignmentCount: number;
        readonly preparationControl: {
          readonly active: boolean;
          readonly snapshotSurfaceId: string | null;
          readonly sourceId: string;
          readonly textCoverageState: GpuRetainedDomControlSourceDescriptor["textCoverageState"];
          readonly visualPolicy: string;
        } | null;
        readonly preparationControlCount: number;
        readonly preparationFrameIds: {
          readonly committedFrameId: number;
          readonly runtimeFrameId: number;
        };
        readonly preparationMountedControl: string | null;
        readonly preparationMountedControlCount: number;
        readonly preparationSnapshotControl: string | null;
        readonly preparationSnapshotControlCount: number;
        readonly readiness: unknown;
      };
      __settaGpuFlowDomControlPlaneDiagnostics?: () => GpuFlowDomControlPlaneDiagnostics;
    };
    view.__settaGpuFlowBrowserVisualPreparationDiagnostics = (actorId) =>
      createGpuFlowBrowserVisualPreparationDiagnostics({
        actorId: actorId ?? null,
        browserVisualRuntime,
      });
    view.__settaGpuFlowDomControlPlaneDiagnostics = () => ({
      ...browserVisualRuntime.getDomControlDiagnostics(),
    });
    return () => {
      if (view.__settaGpuFlowBrowserVisualPreparationDiagnostics) {
        delete view.__settaGpuFlowBrowserVisualPreparationDiagnostics;
      }
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
      {...getGpuFlowVisibleFrameIdentityDataAttributes(publicationToken)}
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
            presentation="visible"
            publicationToken={publicationToken}
            renderControl={renderControl}
            setControlCompositionActive={setControlCompositionActive}
            setControlElement={setControlElement}
          />
        );
      })}
      {preparationControlsToMount.length > 0 ? (
        <div
          aria-hidden="true"
          data-gpu-flow-dom-control-preparation-layer="true"
        >
          {preparationControlsToMount.map((control) => {
            const initialStyle = projectGpuFlowDomControlPlaneHost({
              control,
              getRetainedScrollOffset,
              suspendPassivePointerActivation: true,
              viewport,
            });
            return (
              <GpuFlowDomControlHost
                assignment={undefined}
                control={control}
                getRetainedScrollOffset={getRetainedScrollOffset}
                initialStyle={initialStyle}
                key={control.sourceId}
                onActivate={undefined}
                presentation="preparation"
                publicationToken={null}
                renderControl={renderControl}
                setControlCompositionActive={setControlCompositionActive}
                setControlElement={setControlElement}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function requestGpuFlowDomControlHostFrameIfNeeded({
  browserVisualRuntime,
  control,
  element,
  presentation,
  surfaceRef,
}: {
  readonly browserVisualRuntime: GpuFlowBrowserVisualActorRuntime;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly element: HTMLElement | null;
  readonly presentation: "preparation" | "visible";
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null> | undefined;
}) {
  if (!element) {
    return;
  }
  if (presentation === "preparation" && control.active) {
    requestGpuFlowDomControlActivationFrame({ element, surfaceRef });
    return;
  }
  if (shouldRequestGpuFlowDomControlHostRepairFrame({ control })) {
    browserVisualRuntime.requestCommittedBrowserVisualRepairFrame({
      surface: surfaceRef?.current,
    });
  }
}

function requestGpuFlowDomControlActivationFrame({
  element,
  surfaceRef,
}: {
  readonly element: HTMLElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null> | undefined;
}) {
  surfaceRef?.current?.requestFrame("dom-control-activation");
  element.ownerDocument.defaultView?.setTimeout(() => {
    surfaceRef?.current?.requestFrame("dom-control-activation");
  }, 0);
}

function isGpuFlowDomControlPreparationHostRequired({
  control,
  visibleControlById,
  visibleControlIds,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly visibleControlById: ReadonlyMap<
    string,
    GpuRetainedDomControlSourceDescriptor
  >;
  readonly visibleControlIds: ReadonlySet<string>;
}): boolean {
  if (!visibleControlIds.has(control.sourceId)) {
    return true;
  }
  const visibleControl = visibleControlById.get(control.sourceId);
  return (
    !visibleControl ||
    visibleControl.sourceKey !== control.sourceKey ||
    visibleControl.textCoverageRevision !== control.textCoverageRevision ||
    visibleControl.valueStyleRevision !== control.valueStyleRevision
  );
}

function createGpuFlowBrowserVisualPreparationDiagnostics({
  actorId,
  browserVisualRuntime,
}: {
  readonly actorId: string | null;
  readonly browserVisualRuntime: GpuFlowBrowserVisualActorRuntime;
}) {
  const preparation = browserVisualRuntime.getPreparationSnapshot();
  const preparationAssignment =
    preparation.domControls.assignments.find(
      (assignment) => assignment.control.sourceId === actorId,
    ) ?? null;
  const preparationControl =
    preparation.domControls.controls.find(
      (control) => control.sourceId === actorId,
    ) ?? null;
  return {
    preparationAssignment:
      createGpuFlowDomControlPreparationAssignmentDiagnostic(
        preparationAssignment,
      ),
    preparationAssignmentCount: preparation.domControls.assignments.length,
    preparationControl:
      createGpuFlowDomControlPreparationControlDiagnostic(preparationControl),
    preparationControlCount: preparation.domControls.controls.length,
    preparationFrameIds: preparation.frameIds,
    preparationMountedControl:
      preparation.domControls.mountedControls.find(
        (control) => control.sourceId === actorId,
      )?.sourceId ?? null,
    preparationMountedControlCount:
      preparation.domControls.mountedControls.length,
    preparationSnapshotControl:
      preparation.domControls.snapshotControls.find(
        (control) => control.sourceId === actorId,
      )?.sourceId ?? null,
    preparationSnapshotControlCount:
      preparation.domControls.snapshotControls.length,
    readiness: actorId
      ? browserVisualRuntime.getDomControlHostReadinessDiagnostics(actorId)
      : null,
  };
}

function createGpuFlowDomControlPreparationAssignmentDiagnostic(
  assignment: GpuFlowDomControlProjectionAssignment | null,
) {
  if (!assignment) {
    return null;
  }
  return {
    coverageState: assignment.coverageState,
    phase: assignment.phase,
    priority: assignment.priority,
    reason: assignment.reason,
    sourceId: assignment.control.sourceId,
    textCoverageState: assignment.control.textCoverageState,
    visualPolicy: assignment.control.visualPolicy,
  };
}

function createGpuFlowDomControlPreparationControlDiagnostic(
  control: GpuRetainedDomControlSourceDescriptor | null,
) {
  if (!control) {
    return null;
  }
  return {
    active: control.active,
    snapshotSurfaceId: control.snapshotSurfaceId,
    sourceId: control.sourceId,
    textCoverageState: control.textCoverageState,
    visualPolicy: control.visualPolicy,
  };
}

function GpuFlowDomControlHost({
  assignment,
  control,
  getRetainedScrollOffset,
  initialStyle,
  onActivate,
  presentation,
  publicationToken,
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
  readonly presentation: "preparation" | "visible";
  readonly publicationToken: GpuFlowCommitPublicationToken | null;
  readonly renderControl: GpuFlowDomControlRenderer;
  readonly setControlCompositionActive: (
    controlId: string,
    active: boolean,
  ) => void;
  readonly setControlElement: (
    control: GpuRetainedDomControlSourceDescriptor,
    element: HTMLElement | null,
    presentation: "preparation" | "visible",
    token: GpuFlowCommitPublicationToken | null,
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
        setControlElement(nextControl, element, presentation, publicationToken);
        return;
      }
      const previousControl =
        registeredControlRef.current ?? latestControlRef.current;
      registeredControlRef.current = null;
      setControlElement(previousControl, null, presentation, publicationToken);
    },
    [presentation, publicationToken, setControlElement],
  );

  useLayoutEffect(() => {
    const element = hostElementRef.current;
    if (!element || registeredControlRef.current === control) {
      return;
    }
    registeredControlRef.current = control;
    setControlElement(control, element, presentation, publicationToken);
  }, [control, presentation, publicationToken, setControlElement]);

  useLayoutEffect(() => {
    if (presentation !== "visible" || !control.active) {
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
  }, [control.active, control.sourceId, control.sourceKey, presentation]);
  const hostStyle =
    presentation === "preparation"
      ? {
          ...initialStyle,
          opacity: 0,
          pointerEvents: "none" as const,
          transform: "translate3d(-100000px, -100000px, 0)",
          visibility: "hidden" as const,
        }
      : initialStyle;
  const requestRetainedControlActivation = useCallback(
    (clientPoint: { readonly x: number; readonly y: number }) => {
      if (presentation !== "visible") {
        return;
      }
      if (control.active || control.disabled) {
        return;
      }
      onActivate?.(control, {
        clientPoint,
        kind: "pointer",
      });
    },
    [control, onActivate, presentation],
  );

  return (
    <div
      aria-hidden={
        control.visualSemantics.accessibility === "visual-only-aria-hidden"
          ? true
          : undefined
      }
      className={GPU_FLOW_DOM_CONTROL_HOST_CLASS_NAME}
      data-gpu-flow-dom-control={
        presentation === "visible" ? "true" : undefined
      }
      data-gpu-flow-dom-control-preparation={
        presentation === "preparation" ? "true" : undefined
      }
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
        if (event.button !== 0) {
          return;
        }
        requestRetainedControlActivation({
          x: event.clientX,
          y: event.clientY,
        });
      }}
      onMouseDownCapture={(event) => {
        if (event.button !== 0) {
          return;
        }
        requestRetainedControlActivation({
          x: event.clientX,
          y: event.clientY,
        });
      }}
      onCompositionEndCapture={() => {
        if (presentation !== "visible") {
          return;
        }
        setControlCompositionActive(control.sourceId, false);
      }}
      onCompositionStartCapture={() => {
        if (presentation !== "visible") {
          return;
        }
        setControlCompositionActive(control.sourceId, true);
      }}
      ref={setHostElement}
      style={hostStyle}
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
          hostPresentation: presentation,
          onActivate,
          presentation: "dom-control-plane",
        })}
      </div>
    </div>
  );
}

function shouldRequestGpuFlowDomControlHostRepairFrame({
  control,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): boolean {
  return control.active;
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
