import type { GpuFlowCommittedSurfaceBrowserVisualReadiness } from "../committedSurfaceFrame";
import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuDomIsland } from "../scene";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  addSetValue,
  areBrowserVisualActorRuntimeSnapshotsEqual,
  blurFocusedDescendantBeforeUnmount,
  createGpuFlowDomControlProjectionSourceRevision,
  deleteSetValue,
  isProjectableDomControlAssignment,
  mergeGpuFlowDomControlProjectedControls,
  parkDomControlElement,
  resolveGpuFlowBrowserVisualActorFrameIds,
  syncGpuFlowBrowserVisualDomIslandLayerStyles,
} from "./browserVisualActorRuntimeHelpers";
import {
  createGpuFlowBrowserVisualDomControlReadinessByActorId,
  createGpuFlowBrowserVisualDomIslandReadinessByActorId,
  describeGpuFlowDomControlHostReadiness,
  isGpuFlowDomControlSnapshotReady,
  withGpuFlowFocusedDomControlPins,
  type GpuFlowDomControlHostReadinessDiagnostics,
  type GpuFlowDomControlReadinessContext,
} from "./browserVisualActorRuntimeReadiness";
import {
  createEmptyDomControlPlaneDiagnostics,
  createGpuFlowDomControlProjectionManager,
  type GpuFlowDomControlPlaneDiagnostics,
  type GpuFlowDomControlPlaneMountedHost,
  type GpuFlowDomControlProjectionAssignment,
  type GpuFlowRetainedScrollOffsetGetter,
} from "./domControlPlaneProjection";
import {
  getGpuFlowDomControlPlaneViewportSize,
  getLiveGpuFlowDomControlPlaneViewport,
} from "./domControlPlaneViewport";
import {
  assertGpuFlowCommitPublicationTokenForFrameId,
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

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
    readonly snapshotControls: readonly GpuRetainedDomControlSourceDescriptor[];
    readonly sourceRevision: string;
  };
  readonly domIslands: {
    readonly islands: readonly GpuDomIsland[];
  };
  readonly frameIds: GpuFlowBrowserVisualActorRuntimeFrameIds;
  readonly publicationToken: GpuFlowCommitPublicationToken | null;
};

type BrowserVisualActorRuntimeListener = () => void;
type GpuFlowBrowserVisualActorProjectionInput = {
  readonly token: GpuFlowCommitPublicationToken;
  readonly viewport?: GpuViewportInput | undefined;
};

export type GpuFlowBrowserVisualActorCandidate = {
  readonly id: string;
  readonly readiness: GpuFlowCommittedSurfaceBrowserVisualReadiness;
  readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
};

const EMPTY_DOM_CONTROL_DESCRIPTORS: readonly GpuRetainedDomControlSourceDescriptor[] =
  Object.freeze([]);
const EMPTY_DOM_ISLANDS: readonly GpuDomIsland[] = Object.freeze([]);
const GPU_FLOW_BROWSER_VISUAL_LIVE_PREPARATION_BATCH_SIZE = 4;
const GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_PREPARATION_BATCH_SIZE = 64;
const GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_STAGE_BATCH_SIZE = 4;

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
  return runtime;
}

function resolveGpuFlowBrowserVisualActorProjectionViewport({
  committedFrameId,
  projectionInput,
}: {
  readonly committedFrameId: number;
  readonly projectionInput:
    | GpuFlowBrowserVisualActorProjectionInput
    | undefined;
}): GpuViewportInput | undefined {
  if (!projectionInput) {
    throw new Error(
      "GPU Flow current browser visual projection requires a commit publication token.",
    );
  }
  assertGpuFlowCommitPublicationTokenForFrameId({
    committedFrameId,
    token: projectionInput.token,
  });
  return projectionInput.viewport;
}

export class GpuFlowBrowserVisualActorRuntime {
  private controlViewportRuntime: GpuFlowViewportRuntime | null = null;
  private controlViewportStore: GpuFlowViewportStoreApi | null = null;
  private diagnostics = createEmptyDomControlPlaneDiagnostics({
    committedFrameId: 0,
    runtimeFrameId: 0,
  });
  private readonly preparationDomControlHostById = new Map<
    string,
    GpuFlowDomControlPlaneMountedHost
  >();
  private readonly visibleDomControlHostById = new Map<
    string,
    GpuFlowDomControlPlaneMountedHost
  >();
  private readonly domControlSnapshotElementBySurfaceId = new Map<
    string,
    HTMLElement
  >();
  private readonly composingDomControlIds = new Set<string>();
  private domControlSnapshotTextureManager: Pick<
    HtmlSurfaceTextureManager,
    "getCommittedSurfaceTexture"
  > | null = null;
  private readonly domIslandElementById = new Map<string, HTMLElement>();
  private readonly domIslandRegistrationCommittedFrameIdById = new Map<
    string,
    number
  >();
  private getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  private islandViewportRuntime: GpuFlowViewportRuntime | null = null;
  private islandViewportStore: GpuFlowViewportStoreApi | null = null;
  private readonly listeners = new Set<BrowserVisualActorRuntimeListener>();
  private readonly projectionManager =
    createGpuFlowDomControlProjectionManager();
  private preparationSnapshot = createEmptyBrowserVisualActorRuntimeSnapshot();
  private readonly preparationListeners =
    new Set<BrowserVisualActorRuntimeListener>();
  private snapshot = createEmptyBrowserVisualActorRuntimeSnapshot();
  private snapshotEmitQueued = false;
  private snapshotPublicationToken: GpuFlowCommitPublicationToken | null = null;
  private suspendPassivePointerActivation = false;

  getSnapshot(): GpuFlowBrowserVisualActorRuntimeSnapshot {
    return this.snapshot;
  }

  getPreparationSnapshot(): GpuFlowBrowserVisualActorRuntimeSnapshot {
    return this.preparationSnapshot;
  }

  getDomControlDiagnostics(): GpuFlowDomControlPlaneDiagnostics {
    return { ...this.diagnostics };
  }

  getDomControlHostReadinessDiagnostics(
    controlId: string,
  ): GpuFlowDomControlHostReadinessDiagnostics {
    const control =
      this.preparationSnapshot.domControls.controlById.get(controlId) ??
      this.snapshot.domControls.controlById.get(controlId) ??
      null;
    return describeGpuFlowDomControlHostReadiness({
      context: this.getDomControlReadinessContext(),
      control,
    });
  }

  subscribe(listener: BrowserVisualActorRuntimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribePreparation(
    listener: BrowserVisualActorRuntimeListener,
  ): () => void {
    this.preparationListeners.add(listener);
    return () => {
      this.preparationListeners.delete(listener);
    };
  }

  prepareCommittedSurfaceFrame({
    retainedDisplayFrame,
    viewport,
  }: {
    readonly retainedDisplayFrame: RetainedDisplayFrame;
    readonly viewport?: GpuViewportInput | undefined;
  }): GpuFlowBrowserVisualActorCandidate {
    const retainedRuntimeFrame = retainedDisplayFrame.retainedRuntimeFrame;
    const frameIds = resolveGpuFlowBrowserVisualActorFrameIds({
      committedFrameId: retainedDisplayFrame.id,
      retainedRuntimeFrame,
    });
    const controls = withGpuFlowFocusedDomControlPins({
      composingDomControlIds: this.composingDomControlIds,
      controls: retainedRuntimeFrame.descriptors.domControlSources,
      visibleDomControlHostById: this.visibleDomControlHostById,
    });
    const controlById = new Map(
      controls.map((control) => [control.sourceId, control]),
    );
    const sourceRevision = createGpuFlowDomControlProjectionSourceRevision({
      controls,
      frameIds,
    });
    const preparedDomControls = this.resolveDomControlProjection({
      controlById,
      controls,
      sourceRevision,
      viewport,
    });
    const preparedSnapshot = Object.freeze({
      domControls: preparedDomControls,
      domIslands: Object.freeze({
        islands: Object.freeze([
          ...(retainedRuntimeFrame.descriptors.nativeDomIslands ??
            EMPTY_DOM_ISLANDS),
        ]),
      }),
      frameIds,
      publicationToken: null,
    });
    const readiness = Object.freeze({
      domControlReadinessByActorId:
        createGpuFlowBrowserVisualDomControlReadinessByActorId({
          context: this.getDomControlReadinessContext(),
          preparedDomControls,
        }),
      domIslandReadinessByActorId:
        createGpuFlowBrowserVisualDomIslandReadinessByActorId({
          domIslandElementById: this.domIslandElementById,
          islands:
            retainedRuntimeFrame.descriptors.nativeDomIslands ??
            EMPTY_DOM_ISLANDS,
        }),
    });
    return Object.freeze({
      id: `browser-visual-candidate:${frameIds.committedFrameId}:${frameIds.runtimeFrameId}`,
      readiness,
      snapshot: preparedSnapshot,
    });
  }

  stagePreparedBrowserVisualActors({
    candidate,
    token,
  }: {
    readonly candidate: GpuFlowBrowserVisualActorCandidate;
    readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
  }): void {
    assertGpuFlowPreparedCandidateAbortToken({ token });
    this.stageBrowserVisualPreparation({
      preparedSnapshot: candidate.snapshot,
      token,
    });
  }

  commitPreparedBrowserVisualActors({
    candidate,
    token,
  }: {
    readonly candidate: GpuFlowBrowserVisualActorCandidate;
    readonly token: GpuFlowCommitPublicationToken;
  }): void {
    const snapshotChanged = this.publishBrowserVisualSnapshot({
      nextSnapshot: candidate.snapshot,
      token,
    });
    this.publishBrowserVisualHostPresentation({
      candidate,
      token,
    });
    this.projectionManager.commitPromotedRepresentations(
      candidate.snapshot.domControls.assignments,
    );
    if (snapshotChanged) {
      this.scheduleSnapshotEmit();
    }
  }

  abortPreparedBrowserVisualActors({
    candidate,
    token,
  }: {
    readonly candidate: GpuFlowBrowserVisualActorCandidate;
    readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
  }): void {
    assertGpuFlowPreparedCandidateAbortToken({ token });
    if (
      this.preparationSnapshot.frameIds.committedFrameId !==
        candidate.snapshot.frameIds.committedFrameId ||
      this.preparationSnapshot.frameIds.runtimeFrameId !==
        candidate.snapshot.frameIds.runtimeFrameId
    ) {
      return;
    }
    this.preparationSnapshot = createEmptyBrowserVisualActorRuntimeSnapshot();
    this.emitPreparation();
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
  }

  setSuspendPassivePointerActivation(suspend: boolean): void {
    if (this.suspendPassivePointerActivation === suspend) {
      return;
    }
    this.suspendPassivePointerActivation = suspend;
  }

  setDomControlElement({
    control,
    element,
    presentation,
    token,
  }: {
    readonly control: GpuRetainedDomControlSourceDescriptor;
    readonly element: HTMLElement | null;
    readonly presentation: "preparation" | "visible";
    readonly token?: GpuFlowCommitPublicationToken | undefined;
  }): void {
    const hostMap = this.getDomControlHostMap(presentation);
    const mounted = hostMap.get(control.sourceId);
    this.assertBrowserVisualHostRegistrationToken({
      committedFrameId:
        !element && token
          ? token.committedFrameId
          : mounted?.registrationCommittedFrameId,
      presentation,
      token,
    });
    if (!element) {
      if (mounted) {
        blurFocusedDescendantBeforeUnmount(mounted.element);
      }
      hostMap.delete(control.sourceId);
      if (presentation === "visible") {
        this.composingDomControlIds.delete(control.sourceId);
      }
      return;
    }
    this.getDomControlHostMap(presentation).set(control.sourceId, {
      control,
      controlId: control.sourceId,
      element,
      ...(presentation === "visible"
        ? { registrationCommittedFrameId: token?.committedFrameId }
        : {}),
    });
    if (!this.isDomControlProjectable(control.sourceId)) {
      parkDomControlElement(element);
    }
  }

  setDomControlSnapshotElement({
    element,
    surfaceId,
  }: {
    readonly element: HTMLElement | null;
    readonly surfaceId: string;
  }): void {
    if (!element) {
      this.domControlSnapshotElementBySurfaceId.delete(surfaceId);
      return;
    }
    this.domControlSnapshotElementBySurfaceId.set(surfaceId, element);
  }

  setDomControlSnapshotTextureManager(
    textureManager: Pick<
      HtmlSurfaceTextureManager,
      "getCommittedSurfaceTexture"
    > | null,
  ): void {
    this.domControlSnapshotTextureManager = textureManager;
  }

  setDomControlCompositionActive({
    active,
    controlId,
  }: {
    readonly active: boolean;
    readonly controlId: string;
  }): void {
    const changed = active
      ? addSetValue(this.composingDomControlIds, controlId)
      : deleteSetValue(this.composingDomControlIds, controlId);
    if (!changed) {
      return;
    }
  }

  requestCommittedBrowserVisualRepairFrame({
    surface,
  }: {
    readonly surface: Pick<GpuSurfaceHandle, "requestFrame"> | null | undefined;
  }): void {
    if (!surface || !this.snapshotPublicationToken) {
      return;
    }
    assertGpuFlowCommitPublicationTokenForFrameId({
      committedFrameId: this.snapshot.frameIds.committedFrameId,
      token: this.snapshotPublicationToken,
    });
    surface.requestFrame("texture-upload");
  }

  setDomIslandElement({
    element,
    islandId,
    presentation,
    token,
  }: {
    readonly element: HTMLElement | null;
    readonly islandId: string;
    readonly presentation: "preparation" | "visible";
    readonly token?: GpuFlowCommitPublicationToken | undefined;
  }): void {
    this.assertBrowserVisualHostRegistrationToken({
      committedFrameId:
        !element && token
          ? token.committedFrameId
          : this.domIslandRegistrationCommittedFrameIdById.get(islandId),
      presentation,
      token,
    });
    if (!element) {
      this.domIslandElementById.delete(islandId);
      this.domIslandRegistrationCommittedFrameIdById.delete(islandId);
      return;
    }
    this.domIslandElementById.set(islandId, element);
    if (presentation === "visible" && token) {
      this.domIslandRegistrationCommittedFrameIdById.set(
        islandId,
        token.committedFrameId,
      );
    }
  }

  projectDomControls(
    projectionInput: GpuFlowBrowserVisualActorProjectionInput,
  ): void {
    const viewportRuntime = this.controlViewportRuntime;
    const viewportStore = this.controlViewportStore;
    if (!viewportRuntime || !viewportStore) {
      return;
    }
    const viewport = resolveGpuFlowBrowserVisualActorProjectionViewport({
      committedFrameId: this.snapshot.frameIds.committedFrameId,
      projectionInput,
    });
    const projectableHostByControlId =
      this.createProjectableDomControlHostMap();
    this.parkUnprojectedDomControlHosts(projectableHostByControlId);
    const projectionViewport =
      viewport ??
      getLiveGpuFlowDomControlPlaneViewport({
        viewportRuntime,
        viewportStore,
      });
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
      [...this.visibleDomControlHostById.entries()].filter(([controlId]) =>
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
    for (const [controlId, host] of this.visibleDomControlHostById) {
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

  projectDomIslands(
    projectionInput: GpuFlowBrowserVisualActorProjectionInput,
  ): void {
    const viewportRuntime = this.islandViewportRuntime;
    const viewportStore = this.islandViewportStore;
    if (!viewportRuntime || !viewportStore) {
      return;
    }
    const viewport = resolveGpuFlowBrowserVisualActorProjectionViewport({
      committedFrameId: this.snapshot.frameIds.committedFrameId,
      projectionInput,
    });
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
        snapshotControls: Object.freeze([]),
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
    const snapshotControls =
      this.resolveDomControlSnapshotPreparationPool(assignments);
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
      snapshotControls: Object.freeze([...snapshotControls]),
      sourceRevision,
    });
  }

  private stageBrowserVisualPreparation({
    preparedSnapshot,
    token,
  }: {
    readonly preparedSnapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
    readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
  }): void {
    const preparedDomControls = preparedSnapshot.domControls;
    const preparedMountedControls =
      this.resolveDomControlLiveHostPreparationStage({
        preparedDomControls,
        token,
      });
    const preparedSnapshotControls =
      this.resolveDomControlSnapshotPreparationStage({
        preparedDomControls,
        token,
      });
    const mountedControls = mergeGpuFlowDomControlProjectedControls({
      controlById: preparedDomControls.controlById,
      currentControls: this.snapshot.domControls.mountedControls,
      nextControls: preparedMountedControls,
    });
    const nextPreparationSnapshot: GpuFlowBrowserVisualActorRuntimeSnapshot =
      Object.freeze({
        domControls: Object.freeze({
          ...preparedDomControls,
          mountedControls: Object.freeze([...mountedControls]),
          snapshotControls: Object.freeze([...preparedSnapshotControls]),
        }),
        domIslands: preparedSnapshot.domIslands,
        frameIds: preparedSnapshot.frameIds,
        publicationToken: null,
      });
    if (
      areBrowserVisualActorRuntimeSnapshotsEqual(
        this.preparationSnapshot,
        nextPreparationSnapshot,
      )
    ) {
      return;
    }
    this.preparationSnapshot = nextPreparationSnapshot;
    this.emitPreparation();
  }

  private publishBrowserVisualSnapshot({
    nextSnapshot,
    token,
  }: {
    readonly nextSnapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
    readonly token: GpuFlowCommitPublicationToken;
  }): boolean {
    assertGpuFlowCommitPublicationTokenForFrameId({
      committedFrameId: nextSnapshot.frameIds.committedFrameId,
      token,
    });
    const publishedSnapshot = withGpuFlowBrowserVisualSnapshotPublicationToken({
      snapshot: nextSnapshot,
      token,
    });
    this.snapshotPublicationToken = token;
    if (
      areBrowserVisualActorRuntimeSnapshotsEqual(this.snapshot, nextSnapshot)
    ) {
      this.snapshot = publishedSnapshot;
      return false;
    }
    this.snapshot = publishedSnapshot;
    this.diagnostics = createEmptyDomControlPlaneDiagnostics({
      committedFrameId: nextSnapshot.frameIds.committedFrameId,
      runtimeFrameId: nextSnapshot.frameIds.runtimeFrameId,
    });
    return true;
  }

  private publishBrowserVisualHostPresentation({
    candidate,
    token,
  }: {
    readonly candidate: GpuFlowBrowserVisualActorCandidate;
    readonly token: GpuFlowCommitPublicationToken;
  }): void {
    assertGpuFlowCommitPublicationTokenForFrameId({
      committedFrameId: candidate.snapshot.frameIds.committedFrameId,
      token,
    });
    this.publishDomControlHostPresentation({
      snapshot: candidate.snapshot,
      token,
    });
    this.publishDomIslandHostPresentation({
      snapshot: candidate.snapshot,
      token,
    });
  }

  private publishDomControlHostPresentation({
    snapshot,
    token,
  }: {
    readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
    readonly token: GpuFlowCommitPublicationToken;
  }): void {
    const visibleControlIds = new Set(
      snapshot.domControls.mountedControls.map((control) => control.sourceId),
    );
    for (const control of snapshot.domControls.mountedControls) {
      const host =
        this.visibleDomControlHostById.get(control.sourceId) ??
        this.preparationDomControlHostById.get(control.sourceId);
      if (!host) {
        continue;
      }
      this.preparationDomControlHostById.delete(control.sourceId);
      applyVisibleGpuFlowDomControlHostPresentation({
        control,
        element: host.element,
      });
      this.visibleDomControlHostById.set(control.sourceId, {
        control,
        controlId: control.sourceId,
        element: host.element,
        registrationCommittedFrameId: token.committedFrameId,
      });
    }
    for (const [controlId, host] of this.visibleDomControlHostById) {
      if (visibleControlIds.has(controlId)) {
        continue;
      }
      blurFocusedDescendantBeforeUnmount(host.element);
      parkDomControlElement(host.element);
      this.visibleDomControlHostById.delete(controlId);
      this.composingDomControlIds.delete(controlId);
    }
  }

  private publishDomIslandHostPresentation({
    snapshot,
    token,
  }: {
    readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
    readonly token: GpuFlowCommitPublicationToken;
  }): void {
    const visibleIslandIds = new Set(
      snapshot.domIslands.islands.map((island) => island.id),
    );
    for (const island of snapshot.domIslands.islands) {
      const element = this.domIslandElementById.get(island.id);
      if (!element) {
        continue;
      }
      element.dataset.gpuFlowDomIsland = "true";
      delete element.dataset.gpuFlowDomIslandPreparation;
      element.style.removeProperty("opacity");
      element.style.removeProperty("visibility");
      this.domIslandRegistrationCommittedFrameIdById.set(
        island.id,
        token.committedFrameId,
      );
    }
    for (const islandId of [
      ...this.domIslandRegistrationCommittedFrameIdById.keys(),
    ]) {
      if (visibleIslandIds.has(islandId)) {
        continue;
      }
      const element = this.domIslandElementById.get(islandId);
      if (element) {
        element.style.display = "none";
        element.style.pointerEvents = "none";
        delete element.dataset.gpuFlowDomIsland;
      }
      this.domIslandRegistrationCommittedFrameIdById.delete(islandId);
    }
  }

  private resolveDomControlLiveHostPreparationStage({
    preparedDomControls,
    token,
  }: {
    readonly preparedDomControls: GpuFlowBrowserVisualActorRuntimeSnapshot["domControls"];
    readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
  }): readonly GpuRetainedDomControlSourceDescriptor[] {
    const requestedActorIds = getGpuFlowBrowserVisualRepairActorIds(token);
    const readyControls: GpuRetainedDomControlSourceDescriptor[] = [];
    const pendingControls: GpuRetainedDomControlSourceDescriptor[] = [];
    for (const control of preparedDomControls.mountedControls) {
      if (this.isDomControlHostReady(control)) {
        readyControls.push(control);
        continue;
      }
      if (requestedActorIds && !requestedActorIds.has(control.sourceId)) {
        continue;
      }
      pendingControls.push(control);
    }
    return Object.freeze([
      ...readyControls,
      ...pendingControls.slice(
        0,
        GPU_FLOW_BROWSER_VISUAL_LIVE_PREPARATION_BATCH_SIZE,
      ),
    ]);
  }

  private resolveDomControlSnapshotPreparationStage({
    preparedDomControls,
    token,
  }: {
    readonly preparedDomControls: GpuFlowBrowserVisualActorRuntimeSnapshot["domControls"];
    readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
  }): readonly GpuRetainedDomControlSourceDescriptor[] {
    const requestedActorIds = getGpuFlowBrowserVisualRepairActorIds(token);
    const readyControls: GpuRetainedDomControlSourceDescriptor[] = [];
    const pendingControls: GpuRetainedDomControlSourceDescriptor[] = [];
    for (const control of preparedDomControls.snapshotControls) {
      if (
        isGpuFlowDomControlSnapshotReady({
          control,
          domControlSnapshotElementBySurfaceId:
            this.domControlSnapshotElementBySurfaceId,
          domControlSnapshotTextureManager:
            this.domControlSnapshotTextureManager,
        })
      ) {
        readyControls.push(control);
        continue;
      }
      if (requestedActorIds && !requestedActorIds.has(control.sourceId)) {
        continue;
      }
      pendingControls.push(control);
    }
    return Object.freeze([
      ...readyControls,
      ...pendingControls.slice(
        0,
        GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_STAGE_BATCH_SIZE,
      ),
    ]);
  }

  private assertBrowserVisualHostRegistrationToken({
    committedFrameId,
    presentation,
    token,
  }: {
    readonly committedFrameId?: number | undefined;
    readonly presentation: "preparation" | "visible";
    readonly token?: GpuFlowCommitPublicationToken | undefined;
  }): void {
    if (presentation !== "visible") {
      return;
    }
    if (!token) {
      throw new Error(
        "GPU Flow visible browser visual host registration requires a committed publication token.",
      );
    }
    assertGpuFlowCommitPublicationTokenForFrameId({
      committedFrameId:
        committedFrameId ?? this.snapshot.frameIds.committedFrameId,
      token,
    });
  }

  private resolveDomControlSnapshotPreparationPool(
    assignments: readonly GpuFlowDomControlProjectionAssignment[],
  ): readonly GpuRetainedDomControlSourceDescriptor[] {
    const readyControls: GpuRetainedDomControlSourceDescriptor[] = [];
    const pendingControls: GpuRetainedDomControlSourceDescriptor[] = [];
    for (const assignment of assignments) {
      if (!isDomControlSnapshotPreparationAssignment(assignment)) {
        continue;
      }
      if (
        isGpuFlowDomControlSnapshotReady({
          control: assignment.control,
          domControlSnapshotElementBySurfaceId:
            this.domControlSnapshotElementBySurfaceId,
          domControlSnapshotTextureManager:
            this.domControlSnapshotTextureManager,
        })
      ) {
        readyControls.push(assignment.control);
      } else {
        pendingControls.push(assignment.control);
      }
    }
    return Object.freeze([
      ...readyControls,
      ...pendingControls.slice(
        0,
        GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_PREPARATION_BATCH_SIZE,
      ),
    ]);
  }

  private isDomControlHostReady(
    control: GpuRetainedDomControlSourceDescriptor,
  ): boolean {
    return describeGpuFlowDomControlHostReadiness({
      context: this.getDomControlReadinessContext(),
      control,
    }).ready;
  }

  private scheduleSnapshotEmit(): void {
    if (this.snapshotEmitQueued) {
      return;
    }
    this.snapshotEmitQueued = true;
    queueMicrotask(() => {
      this.snapshotEmitQueued = false;
      this.emitSnapshot();
    });
  }

  private emitSnapshot(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private emitPreparation(): void {
    for (const listener of this.preparationListeners) {
      listener();
    }
  }

  private getDomControlHostMap(
    presentation: "preparation" | "visible",
  ): Map<string, GpuFlowDomControlPlaneMountedHost> {
    return presentation === "visible"
      ? this.visibleDomControlHostById
      : this.preparationDomControlHostById;
  }

  private getDomControlReadinessContext(): GpuFlowDomControlReadinessContext {
    return {
      domControlSnapshotElementBySurfaceId:
        this.domControlSnapshotElementBySurfaceId,
      domControlSnapshotTextureManager: this.domControlSnapshotTextureManager,
      preparationDomControlHostById: this.preparationDomControlHostById,
      visibleDomControlHostById: this.visibleDomControlHostById,
    };
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
      snapshotControls: EMPTY_DOM_CONTROL_DESCRIPTORS,
      sourceRevision: "",
    }),
    domIslands: Object.freeze({
      islands: EMPTY_DOM_ISLANDS,
    }),
    frameIds,
    publicationToken: null,
  });
}

function withGpuFlowBrowserVisualSnapshotPublicationToken({
  snapshot,
  token,
}: {
  readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
  readonly token: GpuFlowCommitPublicationToken;
}): GpuFlowBrowserVisualActorRuntimeSnapshot {
  return Object.freeze({
    ...snapshot,
    publicationToken: token,
  });
}

function applyVisibleGpuFlowDomControlHostPresentation({
  control,
  element,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly element: HTMLElement;
}): void {
  element.dataset.gpuFlowDomControl = "true";
  delete element.dataset.gpuFlowDomControlPreparation;
  element.dataset.gpuFlowDomControlId = control.sourceId;
  element.dataset.gpuFlowDomControlFocusable =
    control.visualSemantics.focusable ? "true" : "false";
  element.dataset.gpuFlowDomControlPointerSemantics =
    control.visualSemantics.pointer;
  element.dataset.gpuFlowDomControlRowId = control.rowId;
  element.dataset.gpuFlowDomControlSelectable =
    control.visualSemantics.selectable;
  element.dataset.gpuFlowDomControlSectionId = control.sectionId;
  element.dataset.gpuFlowDomControlSurfaceId = control.surfaceId;
  element.dataset.gpuFlowDomControlActive = control.active ? "true" : "false";
  if (control.visualSemantics.accessibility === "visual-only-aria-hidden") {
    element.setAttribute("aria-hidden", "true");
  } else {
    element.removeAttribute("aria-hidden");
  }
  element.style.removeProperty("opacity");
  element.style.removeProperty("visibility");
}

function isDomControlSnapshotPreparationAssignment(
  assignment: GpuFlowDomControlProjectionAssignment,
): boolean {
  return (
    assignment.coverageState === "snapshot" ||
    assignment.coverageState === "blocked-awaiting-browser-visual" ||
    (assignment.coverageState === "blocked-awaiting-live-host" &&
      assignment.reason === "live-host-overflow" &&
      !assignment.control.active)
  );
}

function getGpuFlowBrowserVisualRepairActorIds(
  token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken,
): ReadonlySet<string> | null {
  if (!("blockedReasons" in token)) {
    return null;
  }
  const actorIds = token.blockedReasons.flatMap((reason) =>
    reason.actorId === null ? [] : [reason.actorId],
  );
  return actorIds.length > 0 ? new Set(actorIds) : null;
}
