import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import {
  applyHtmlSurfaceActiveDomIslandProjection,
  hideHtmlSurfaceActiveDomIslandProjection,
  projectHtmlSurfaceActiveDomIsland,
} from "../htmlSurfaces/interactionProjector";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuDomIsland } from "../scene";
import { getVisibleFlowRect, type GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  createEmptyDomControlPlaneDiagnostics,
  createGpuFlowDomControlProjectionManager,
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

export type GpuFlowBrowserVisualActorRuntimeFrameIds = {
  readonly committedFrameId: number;
  readonly runtimeFrameId: number;
};

export type GpuFlowBrowserVisualActorRuntimeSnapshot = {
  readonly domControls: {
    readonly assignments: readonly GpuFlowDomControlProjectionAssignment[];
    readonly controlById: ReadonlyMap<
      string,
      GpuRetainedDomControlSourceDescriptor
    >;
    readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
    readonly mountedControls: readonly GpuRetainedDomControlSourceDescriptor[];
    readonly sourceRevision: string;
  };
  readonly domIslands: {
    readonly islands: readonly GpuDomIsland[];
  };
  readonly frameIds: GpuFlowBrowserVisualActorRuntimeFrameIds;
};

type BrowserVisualActorRuntimeListener = () => void;

const GPU_FLOW_DOM_CONTROL_HOST_RETAINED_PREVIOUS_LIMIT = 64;
const EMPTY_DOM_CONTROL_DESCRIPTORS: readonly GpuRetainedDomControlSourceDescriptor[] =
  Object.freeze([]);
const EMPTY_DOM_ISLANDS: readonly GpuDomIsland[] = Object.freeze([]);

const browserVisualActorRuntimeByCommittedSurfaceRuntime = new WeakMap<
  GpuFlowCommittedSurfaceRuntime,
  GpuFlowBrowserVisualActorRuntime
>();

export function createGpuFlowBrowserVisualActorRuntime(): GpuFlowBrowserVisualActorRuntime {
  return new GpuFlowBrowserVisualActorRuntime();
}

export function getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
  committedSurfaceRuntime: GpuFlowCommittedSurfaceRuntime,
): GpuFlowBrowserVisualActorRuntime {
  const existing = browserVisualActorRuntimeByCommittedSurfaceRuntime.get(
    committedSurfaceRuntime,
  );
  if (existing) {
    return existing;
  }
  const runtime = createGpuFlowBrowserVisualActorRuntime();
  browserVisualActorRuntimeByCommittedSurfaceRuntime.set(
    committedSurfaceRuntime,
    runtime,
  );
  runtime.setCommittedSurfaceSource({ committedSurfaceRuntime });
  return runtime;
}

export class GpuFlowBrowserVisualActorRuntime {
  private committedSurfaceRuntime: GpuFlowCommittedSurfaceRuntime | null = null;
  private controlViewportRuntime: GpuFlowViewportRuntime | null = null;
  private controlViewportStore: GpuFlowViewportStoreApi | null = null;
  private diagnostics = createEmptyDomControlPlaneDiagnostics({
    committedFrameId: 0,
    runtimeFrameId: 0,
  });
  private readonly domControlHostById = new Map<
    string,
    GpuFlowDomControlPlaneMountedHost
  >();
  private readonly domIslandElementById = new Map<string, HTMLElement>();
  private fallbackCommittedFrameId: number | undefined;
  private fallbackRetainedRuntimeFrame: GpuRetainedRuntimeFrame | null = null;
  private getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  private islandViewportRuntime: GpuFlowViewportRuntime | null = null;
  private islandViewportStore: GpuFlowViewportStoreApi | null = null;
  private readonly listeners = new Set<BrowserVisualActorRuntimeListener>();
  private readonly projectionManager =
    createGpuFlowDomControlProjectionManager();
  private retainedScrollProjectionSignature = "";
  private snapshot = createEmptyBrowserVisualActorRuntimeSnapshot();
  private suspendPassivePointerActivation = false;
  private unsubscribeCommittedSurfaceRuntime: (() => void) | null = null;

  getSnapshot(): GpuFlowBrowserVisualActorRuntimeSnapshot {
    return this.snapshot;
  }

  getDomControlDiagnostics(): GpuFlowDomControlPlaneDiagnostics {
    return { ...this.diagnostics };
  }

  subscribe(listener: BrowserVisualActorRuntimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setCommittedSurfaceSource({
    committedFrameId,
    committedSurfaceRuntime,
    retainedRuntimeFrame,
  }: {
    readonly committedFrameId?: number | undefined;
    readonly committedSurfaceRuntime?:
      | GpuFlowCommittedSurfaceRuntime
      | null
      | undefined;
    readonly retainedRuntimeFrame?: GpuRetainedRuntimeFrame | null | undefined;
  }): void {
    this.fallbackCommittedFrameId = committedFrameId;
    this.fallbackRetainedRuntimeFrame = retainedRuntimeFrame ?? null;
    this.setCommittedSurfaceRuntime(committedSurfaceRuntime ?? null);
    this.refreshBrowserActors();
  }

  setDomControlProjectionEnvironment({
    getRetainedScrollOffset,
    viewportRuntime,
    viewportStore,
  }: {
    readonly getRetainedScrollOffset:
      | GpuFlowRetainedScrollOffsetGetter
      | undefined;
    readonly viewportRuntime: GpuFlowViewportRuntime;
    readonly viewportStore: GpuFlowViewportStoreApi;
  }): void {
    this.getRetainedScrollOffset = getRetainedScrollOffset;
    this.controlViewportRuntime = viewportRuntime;
    this.controlViewportStore = viewportStore;
    this.refreshBrowserActors();
    this.projectDomControls();
  }

  setDomIslandProjectionEnvironment({
    viewportRuntime,
    viewportStore,
  }: {
    readonly viewportRuntime: GpuFlowViewportRuntime;
    readonly viewportStore: GpuFlowViewportStoreApi;
  }): void {
    this.islandViewportRuntime = viewportRuntime;
    this.islandViewportStore = viewportStore;
    this.refreshBrowserActors();
    this.projectDomIslands();
  }

  setSuspendPassivePointerActivation(suspend: boolean): void {
    if (this.suspendPassivePointerActivation === suspend) {
      return;
    }
    this.suspendPassivePointerActivation = suspend;
    this.projectDomControls();
  }

  setDomControlElement({
    control,
    element,
  }: {
    readonly control: GpuRetainedDomControlSourceDescriptor;
    readonly element: HTMLElement | null;
  }): void {
    if (!element) {
      const mounted = this.domControlHostById.get(control.sourceId);
      if (mounted) {
        blurFocusedDescendantBeforeUnmount(mounted.element);
      }
      this.domControlHostById.delete(control.sourceId);
      return;
    }
    this.domControlHostById.set(control.sourceId, {
      control,
      controlId: control.sourceId,
      element,
    });
    if (this.isDomControlProjectable(control.sourceId)) {
      this.syncDomControlElement(control, element);
      return;
    }
    parkDomControlElement(element);
  }

  setDomIslandElement({
    element,
    islandId,
  }: {
    readonly element: HTMLElement | null;
    readonly islandId: string;
  }): void {
    if (!element) {
      this.domIslandElementById.delete(islandId);
      return;
    }
    this.domIslandElementById.set(islandId, element);
    const island = this.getDomIslandById().get(islandId);
    if (island) {
      this.syncDomIslandElement({ element, island });
    }
  }

  projectDomControls(viewport?: GpuViewportInput): void {
    const viewportRuntime = this.controlViewportRuntime;
    const viewportStore = this.controlViewportStore;
    if (!viewportRuntime || !viewportStore) {
      return;
    }
    const projectableHostByControlId =
      this.createProjectableDomControlHostMap();
    this.parkUnprojectedDomControlHosts(projectableHostByControlId);
    const projectionViewport =
      viewport ??
      getLiveGpuFlowDomControlPlaneViewport({
        viewportRuntime,
        viewportStore,
      });
    const retainedScrollProjectionSignature =
      createGpuFlowDomControlRetainedScrollProjectionSignature({
        controls: this.snapshot.domControls.controls,
        getRetainedScrollOffset: this.getRetainedScrollOffset,
      });
    if (
      retainedScrollProjectionSignature !==
      this.retainedScrollProjectionSignature
    ) {
      this.retainedScrollProjectionSignature =
        retainedScrollProjectionSignature;
      this.refreshBrowserActors(projectionViewport);
    }
    const diagnosticsRef = { current: this.diagnostics };
    this.projectionManager.project({
      committedFrameId: this.snapshot.frameIds.committedFrameId,
      controlById: this.snapshot.domControls.controlById,
      diagnosticsRef,
      getRetainedScrollOffset: this.getRetainedScrollOffset,
      hostByControlId: projectableHostByControlId,
      runtimeFrameId: this.snapshot.frameIds.runtimeFrameId,
      suspendPassivePointerActivation: this.suspendPassivePointerActivation,
      viewport: projectionViewport,
      viewportSize: getGpuFlowDomControlPlaneViewportSize({
        viewportStore,
      }),
    });
    this.diagnostics = diagnosticsRef.current;
  }

  private createProjectableDomControlHostMap(): ReadonlyMap<
    string,
    GpuFlowDomControlPlaneMountedHost
  > {
    const projectableControlIds = new Set(
      this.snapshot.domControls.assignments
        .filter(isProjectableDomControlAssignment)
        .map((assignment) => assignment.control.sourceId),
    );
    return new Map(
      [...this.domControlHostById.entries()].filter(([controlId]) =>
        projectableControlIds.has(controlId),
      ),
    );
  }

  private parkUnprojectedDomControlHosts(
    projectableHostByControlId: ReadonlyMap<
      string,
      GpuFlowDomControlPlaneMountedHost
    >,
  ): void {
    for (const [controlId, host] of this.domControlHostById) {
      if (projectableHostByControlId.has(controlId)) {
        continue;
      }
      parkDomControlElement(host.element);
    }
  }

  private isDomControlProjectable(controlId: string): boolean {
    return this.snapshot.domControls.assignments.some(
      (assignment) =>
        assignment.control.sourceId === controlId &&
        isProjectableDomControlAssignment(assignment),
    );
  }

  projectDomIslands(viewport?: GpuViewportInput): void {
    const viewportRuntime = this.islandViewportRuntime;
    const viewportStore = this.islandViewportStore;
    if (!viewportRuntime || !viewportStore) {
      return;
    }
    syncGpuFlowBrowserVisualDomIslandLayerStyles({
      elementById: this.domIslandElementById,
      islands: this.snapshot.domIslands.islands,
      viewport: viewport ?? viewportRuntime.getViewportTuple(),
      viewportSize: {
        height: viewportStore.getState().height,
        width: viewportStore.getState().width,
      },
    });
  }

  private setCommittedSurfaceRuntime(
    committedSurfaceRuntime: GpuFlowCommittedSurfaceRuntime | null,
  ): void {
    if (this.committedSurfaceRuntime === committedSurfaceRuntime) {
      return;
    }
    this.unsubscribeCommittedSurfaceRuntime?.();
    this.unsubscribeCommittedSurfaceRuntime = null;
    this.committedSurfaceRuntime = committedSurfaceRuntime;
    if (!committedSurfaceRuntime) {
      return;
    }
    this.unsubscribeCommittedSurfaceRuntime =
      committedSurfaceRuntime.subscribeCommittedContentFrame(() => {
        this.refreshBrowserActors();
        this.projectDomControls();
        this.projectDomIslands();
      });
  }

  private refreshBrowserActors(viewport?: GpuViewportInput): void {
    const nextSnapshot = this.createBrowserVisualActorSnapshot(viewport);
    if (
      areBrowserVisualActorRuntimeSnapshotsEqual(this.snapshot, nextSnapshot)
    ) {
      return;
    }
    this.snapshot = nextSnapshot;
    this.diagnostics = createEmptyDomControlPlaneDiagnostics({
      committedFrameId: nextSnapshot.frameIds.committedFrameId,
      runtimeFrameId: nextSnapshot.frameIds.runtimeFrameId,
    });
    this.emit();
  }

  private createBrowserVisualActorSnapshot(
    viewport: GpuViewportInput | undefined,
  ): GpuFlowBrowserVisualActorRuntimeSnapshot {
    const currentFrame = this.getCurrentCommittedFrame();
    const retainedRuntimeFrame =
      currentFrame?.retainedRuntimeFrame ?? this.fallbackRetainedRuntimeFrame;
    const frameIds = resolveGpuFlowBrowserVisualActorFrameIds({
      committedFrameId:
        currentFrame?.displayFrameId ?? this.fallbackCommittedFrameId,
      retainedRuntimeFrame,
    });
    const controls =
      retainedRuntimeFrame?.descriptors.domControlSources ??
      EMPTY_DOM_CONTROL_DESCRIPTORS;
    const controlById = new Map(
      controls.map((control) => [control.sourceId, control]),
    );
    const sourceRevision = createGpuFlowDomControlProjectionSourceRevision({
      controls,
      frameIds,
    });
    const nextDomControls = this.resolveDomControlProjection({
      controlById,
      controls,
      sourceRevision,
      viewport,
    });
    return Object.freeze({
      domControls: nextDomControls,
      domIslands: Object.freeze({
        islands: Object.freeze([
          ...(retainedRuntimeFrame?.descriptors.nativeDomIslands ??
            EMPTY_DOM_ISLANDS),
        ]),
      }),
      frameIds,
    });
  }

  private resolveDomControlProjection({
    controlById,
    controls,
    sourceRevision,
    viewport,
  }: {
    readonly controlById: ReadonlyMap<
      string,
      GpuRetainedDomControlSourceDescriptor
    >;
    readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
    readonly sourceRevision: string;
    readonly viewport: GpuViewportInput | undefined;
  }): GpuFlowBrowserVisualActorRuntimeSnapshot["domControls"] {
    const viewportRuntime = this.controlViewportRuntime;
    const viewportStore = this.controlViewportStore;
    if (!viewportRuntime || !viewportStore) {
      return Object.freeze({
        assignments: Object.freeze([]),
        controlById,
        controls: Object.freeze([...controls]),
        mountedControls: Object.freeze([]),
        sourceRevision,
      });
    }
    const assignments = this.projectionManager.prepare({
      controls,
      getRetainedScrollOffset: this.getRetainedScrollOffset,
      viewport:
        viewport ??
        getLiveGpuFlowDomControlPlaneViewport({
          viewportRuntime,
          viewportStore,
        }),
      viewportSize: getGpuFlowDomControlPlaneViewportSize({
        viewportStore,
      }),
    });
    const promotedControls = this.projectionManager.promote(assignments);
    const mountedControls = mergeGpuFlowDomControlProjectedControls({
      controlById,
      currentControls: this.snapshot.domControls.mountedControls,
      nextControls: promotedControls,
    });
    return Object.freeze({
      assignments: Object.freeze([...assignments]),
      controlById,
      controls: Object.freeze([...controls]),
      mountedControls: Object.freeze([...mountedControls]),
      sourceRevision,
    });
  }

  private syncDomControlElement(
    control: GpuRetainedDomControlSourceDescriptor,
    element: HTMLElement,
  ): void {
    const viewportRuntime = this.controlViewportRuntime;
    const viewportStore = this.controlViewportStore;
    if (!viewportRuntime || !viewportStore) {
      return;
    }
    syncGpuFlowDomControlPlaneElementStyle({
      control,
      element,
      getRetainedScrollOffset: this.getRetainedScrollOffset,
      suspendPassivePointerActivation: this.suspendPassivePointerActivation,
      viewport: getLiveGpuFlowDomControlPlaneViewport({
        viewportRuntime,
        viewportStore,
      }),
    });
  }

  private syncDomIslandElement({
    element,
    island,
  }: {
    readonly element: HTMLElement;
    readonly island: GpuDomIsland;
  }): void {
    const viewportRuntime = this.islandViewportRuntime;
    if (!viewportRuntime) {
      return;
    }
    applyHtmlSurfaceActiveDomIslandProjection({
      element,
      projection: projectHtmlSurfaceActiveDomIsland({
        flowRect: island.rect,
        viewport: viewportRuntime.getViewportTuple(),
        zIndex: island.zIndex,
      }),
    });
  }

  private getCurrentCommittedFrame(): GpuFlowCommittedSurfaceFrame | null {
    return this.committedSurfaceRuntime?.getCommittedContentFrame() ?? null;
  }

  private getDomIslandById(): ReadonlyMap<string, GpuDomIsland> {
    return new Map(
      this.snapshot.domIslands.islands.map((island) => [island.id, island]),
    );
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function createEmptyBrowserVisualActorRuntimeSnapshot(): GpuFlowBrowserVisualActorRuntimeSnapshot {
  const frameIds = Object.freeze({
    committedFrameId: 0,
    runtimeFrameId: 0,
  });
  return Object.freeze({
    domControls: Object.freeze({
      assignments: Object.freeze([]),
      controlById: new Map(),
      controls: EMPTY_DOM_CONTROL_DESCRIPTORS,
      mountedControls: EMPTY_DOM_CONTROL_DESCRIPTORS,
      sourceRevision: "",
    }),
    domIslands: Object.freeze({
      islands: EMPTY_DOM_ISLANDS,
    }),
    frameIds,
  });
}

function resolveGpuFlowBrowserVisualActorFrameIds({
  committedFrameId,
  retainedRuntimeFrame,
}: {
  readonly committedFrameId: number | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
}): GpuFlowBrowserVisualActorRuntimeFrameIds {
  const runtimeFrameId = retainedRuntimeFrame?.frameId ?? 0;
  return Object.freeze({
    committedFrameId: committedFrameId ?? runtimeFrameId,
    runtimeFrameId,
  });
}

function createGpuFlowDomControlProjectionSourceRevision({
  controls,
  frameIds,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly frameIds: GpuFlowBrowserVisualActorRuntimeFrameIds;
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

function isProjectableDomControlAssignment(
  assignment: GpuFlowDomControlProjectionAssignment,
): boolean {
  return (
    assignment.coverageState === "live" ||
    assignment.coverageState === "compatible-previous"
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

function areBrowserVisualActorRuntimeSnapshotsEqual(
  left: GpuFlowBrowserVisualActorRuntimeSnapshot,
  right: GpuFlowBrowserVisualActorRuntimeSnapshot,
): boolean {
  return (
    left.frameIds.committedFrameId === right.frameIds.committedFrameId &&
    left.frameIds.runtimeFrameId === right.frameIds.runtimeFrameId &&
    left.domControls.sourceRevision === right.domControls.sourceRevision &&
    areGpuFlowDomControlProjectedControlsEqual({
      leftAssignments: left.domControls.assignments,
      leftControls: left.domControls.mountedControls,
      rightAssignments: right.domControls.assignments,
      rightControls: right.domControls.mountedControls,
    }) &&
    areDomIslandListsEqual(left.domIslands.islands, right.domIslands.islands)
  );
}

function areDomIslandListsEqual(
  left: readonly GpuDomIsland[],
  right: readonly GpuDomIsland[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (island, index) =>
        island.id === right[index]?.id &&
        island.kind === right[index]?.kind &&
        island.zIndex === right[index]?.zIndex &&
        rectsEqual(island.rect, right[index]?.rect),
    )
  );
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

function syncGpuFlowBrowserVisualDomIslandLayerStyles({
  elementById,
  islands,
  viewport,
  viewportSize,
}: {
  readonly elementById: ReadonlyMap<string, HTMLElement>;
  readonly islands: readonly GpuDomIsland[];
  readonly viewport: GpuViewportInput;
  readonly viewportSize: { readonly height: number; readonly width: number };
}) {
  const visibleFlowRect = getVisibleFlowRect({
    canvasHeight: viewportSize.height,
    canvasWidth: viewportSize.width,
    marginCssPx: 128,
    viewport,
  });
  for (const island of islands) {
    const element = elementById.get(island.id);
    if (!element) {
      continue;
    }
    if (!rectsIntersect(visibleFlowRect, island.rect)) {
      hideHtmlSurfaceActiveDomIslandProjection(element);
      element.style.pointerEvents = "none";
      continue;
    }
    applyHtmlSurfaceActiveDomIslandProjection({
      element,
      projection: projectHtmlSurfaceActiveDomIsland({
        flowRect: island.rect,
        viewport,
        zIndex: island.zIndex,
      }),
    });
  }
}

function rectsIntersect(
  left: Pick<GpuDomIsland["rect"], "height" | "width" | "x" | "y">,
  right: Pick<GpuDomIsland["rect"], "height" | "width" | "x" | "y">,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function rectsEqual(
  left: Pick<GpuDomIsland["rect"], "height" | "width" | "x" | "y">,
  right: Pick<GpuDomIsland["rect"], "height" | "width" | "x" | "y"> | undefined,
): boolean {
  return Boolean(
    right &&
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height,
  );
}

function parkDomControlElement(element: HTMLElement): void {
  element.style.display = "none";
  element.style.pointerEvents = "none";
}

function blurFocusedDescendantBeforeUnmount(element: HTMLElement) {
  const activeElement = element.ownerDocument.activeElement;
  if (activeElement instanceof HTMLElement && element.contains(activeElement)) {
    activeElement.blur();
  }
}
