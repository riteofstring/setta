import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
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
  publishGpuFlowBrowserVisualDomIslandHostPresentation,
  resolveGpuFlowBrowserVisualActorFrameIds,
  resolveGpuFlowBrowserVisualActorProjectionViewport,
  stampGpuFlowVisibleDomControlHostPresentationIdentity,
  stampGpuFlowVisibleDomIslandHostPresentationIdentity,
  syncGpuFlowBrowserVisualDomIslandLayerStyles,
} from "./browserVisualActorRuntimeHelpers";
import {
  createGpuFlowBrowserVisualDomControlReadinessByActorId,
  createGpuFlowBrowserVisualDomIslandReadinessByActorId,
  describeGpuFlowDomControlHostReadiness,
  withGpuFlowFocusedDomControlPins,
  type GpuFlowDomControlHostReadinessDiagnostics,
  type GpuFlowDomControlReadinessContext,
} from "./browserVisualActorRuntimeReadiness";
import {
  EMPTY_DOM_ISLANDS,
  applyVisibleGpuFlowDomControlHostPresentation,
  createEmptyBrowserVisualActorRuntimeSnapshot,
  createGpuFlowBrowserVisualCandidatePresentationEvidence,
  resolveGpuFlowDomControlLiveHostPreparationStage,
  resolveGpuFlowDomControlSnapshotPreparationPool,
  resolveGpuFlowDomControlSnapshotPreparationStage,
  withGpuFlowBrowserVisualSnapshotPublicationToken,
  type GpuFlowDomControlSnapshotTextureManager,
} from "./browserVisualActorRuntimeState";
import {
  createEmptyDomControlPlaneDiagnostics,
  createGpuFlowDomControlProjectionManager,
  type GpuFlowDomControlPlaneDiagnostics,
  type GpuFlowDomControlPlaneMountedHost,
  type GpuFlowRetainedScrollOffsetGetter,
} from "./domControlPlaneProjection";
import {
  getGpuFlowDomControlPlaneViewportSize,
  getLiveGpuFlowDomControlPlaneViewport,
} from "./domControlPlaneViewport";
import {
  clearGpuFlowVisibleFrameIdentityAttributes,
  setGpuFlowVisibleFrameIdentityAttributes,
} from "./visibleFrameIdentityAttributes";
import {
  assertGpuFlowCommitPublicationTokenForFrameId,
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";
import type {
  BrowserVisualActorPreparationHostRenderer,
  BrowserVisualActorRuntimeListener,
  GpuFlowBrowserVisualActorCandidate,
  GpuFlowBrowserVisualActorProjectionInput,
  GpuFlowBrowserVisualActorRuntimeSnapshot,
} from "./browserVisualActorRuntimeTypes";

export type {
  GpuFlowBrowserVisualActorCandidate,
  GpuFlowBrowserVisualActorRuntimeFrameIds,
  GpuFlowBrowserVisualActorRuntimeSnapshot,
} from "./browserVisualActorRuntimeTypes";

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
  private domControlSnapshotTextureManager: GpuFlowDomControlSnapshotTextureManager | null =
    null;
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
  private domControlPreparationHostRenderer: BrowserVisualActorPreparationHostRenderer | null =
    null;
  private domControlSnapshotPreparationRenderer: BrowserVisualActorPreparationHostRenderer | null =
    null;
  private domIslandPreparationHostRenderer: BrowserVisualActorPreparationHostRenderer | null =
    null;
  private preparationSnapshot = createEmptyBrowserVisualActorRuntimeSnapshot();
  private snapshot = createEmptyBrowserVisualActorRuntimeSnapshot();
  private snapshotEmitQueued = false;
  private snapshotEmitPending = false;
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
  getDomControlRepresentationReadinessDiagnostics(controlId: string) {
    const readiness =
      createGpuFlowBrowserVisualDomControlReadinessByActorId({
        context: this.getDomControlReadinessContext(),
        preparedDomControls: this.preparationSnapshot.domControls,
      }).get(controlId) ?? null;
    return readiness
      ? {
          coverageState: readiness.coverageState,
          projectionCoverageRequired:
            readiness.projectionCoverageRequired === true,
          resourceHandles:
            readiness.resourceHandles?.map((handle) => ({ ...handle })) ?? [],
        }
      : null;
  }
  subscribe(listener: BrowserVisualActorRuntimeListener): () => void {
    this.listeners.add(listener);
    if (this.snapshotEmitPending && !this.snapshotEmitQueued) {
      this.scheduleSnapshotEmit();
    }
    return () => {
      this.listeners.delete(listener);
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
    const candidateId = `browser-visual-candidate:${frameIds.committedFrameId}:${frameIds.runtimeFrameId}`;
    return Object.freeze({
      id: candidateId,
      presentationEvidence:
        createGpuFlowBrowserVisualCandidatePresentationEvidence({
          candidateId,
          frameIds,
          readiness,
          snapshot: preparedSnapshot,
        }),
      readiness,
      snapshot: preparedSnapshot,
    });
  }

  stagePreparedBrowserVisualActors({
    candidate,
    selectedResourceKeys,
    token,
  }: {
    readonly candidate: GpuFlowBrowserVisualActorCandidate;
    readonly selectedResourceKeys?: readonly string[] | undefined;
    readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
  }): void {
    assertGpuFlowPreparedCandidateAbortToken({ token });
    this.stageBrowserVisualPreparation({
      preparedSnapshot: candidate.snapshot,
      selectedResourceKeys,
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
    this.renderBrowserVisualPreparationHosts();
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

  setDomControlPreparationHostRenderer(
    renderer: BrowserVisualActorPreparationHostRenderer | null,
  ): void {
    this.domControlPreparationHostRenderer = renderer;
    renderer?.(this.preparationSnapshot);
  }

  setDomControlSnapshotPreparationRenderer(
    renderer: BrowserVisualActorPreparationHostRenderer | null,
  ): void {
    this.domControlSnapshotPreparationRenderer = renderer;
    renderer?.(this.preparationSnapshot);
  }

  setDomIslandPreparationHostRenderer(
    renderer: BrowserVisualActorPreparationHostRenderer | null,
  ): void {
    this.domIslandPreparationHostRenderer = renderer;
    renderer?.(this.preparationSnapshot);
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
      this.clearDomControlElement({ control, hostMap, mounted, presentation });
      return;
    }
    this.registerDomControlElement({
      control,
      element,
      presentation,
      token,
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

  private clearDomControlElement({
    control,
    hostMap,
    mounted,
    presentation,
  }: {
    readonly control: GpuRetainedDomControlSourceDescriptor;
    readonly hostMap: Map<string, GpuFlowDomControlPlaneMountedHost>;
    readonly mounted: GpuFlowDomControlPlaneMountedHost | undefined;
    readonly presentation: "preparation" | "visible";
  }): void {
    if (mounted) {
      blurFocusedDescendantBeforeUnmount(mounted.element);
    }
    hostMap.delete(control.sourceId);
    if (presentation === "visible") {
      this.composingDomControlIds.delete(control.sourceId);
    }
  }

  private registerDomControlElement({
    control,
    element,
    presentation,
    token,
  }: {
    readonly control: GpuRetainedDomControlSourceDescriptor;
    readonly element: HTMLElement;
    readonly presentation: "preparation" | "visible";
    readonly token?: GpuFlowCommitPublicationToken | undefined;
  }): void {
    if (presentation === "visible" && token) {
      setGpuFlowVisibleFrameIdentityAttributes(element, token);
    }
    this.getDomControlHostMap(presentation).set(control.sourceId, {
      control,
      controlId: control.sourceId,
      element,
      ...(presentation === "visible"
        ? { registrationCommittedFrameId: token?.committedFrameId }
        : {}),
    });
  }

  setDomControlSnapshotTextureManager(
    textureManager: GpuFlowDomControlSnapshotTextureManager | null,
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
      setGpuFlowVisibleFrameIdentityAttributes(element, token);
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
    this.publishBrowserVisualPresentationIdentity(projectionInput.token);
    const projectableHostByControlId =
      this.createProjectableDomControlHostMap();
    stampGpuFlowVisibleDomControlHostPresentationIdentity({
      hostByControlId: this.visibleDomControlHostById,
      token: projectionInput.token,
    });
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
    this.publishBrowserVisualPresentationIdentity(projectionInput.token);
    stampGpuFlowVisibleDomIslandHostPresentationIdentity({
      elementById: this.domIslandElementById,
      registeredIslandIds:
        this.domIslandRegistrationCommittedFrameIdById.keys(),
      token: projectionInput.token,
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

  private publishBrowserVisualPresentationIdentity(
    token: GpuFlowCommitPublicationToken,
  ): void {
    if (this.snapshot.publicationToken === token) {
      return;
    }
    this.snapshot = withGpuFlowBrowserVisualSnapshotPublicationToken({
      snapshot: this.snapshot,
      token,
    });
    this.snapshotPublicationToken = token;
    this.scheduleSnapshotEmit();
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
    const snapshotControls = resolveGpuFlowDomControlSnapshotPreparationPool({
      assignments,
      domControlSnapshotElementBySurfaceId:
        this.domControlSnapshotElementBySurfaceId,
      domControlSnapshotTextureManager: this.domControlSnapshotTextureManager,
    });
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
    selectedResourceKeys,
    token,
  }: {
    readonly preparedSnapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
    readonly selectedResourceKeys?: readonly string[] | undefined;
    readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
  }): void {
    const preparedDomControls = preparedSnapshot.domControls;
    const preparedMountedControls =
      resolveGpuFlowDomControlLiveHostPreparationStage({
        isDomControlHostReady: (control) => this.isDomControlHostReady(control),
        preparedDomControls,
        selectedResourceKeys,
        token,
      });
    const preparedSnapshotControls =
      resolveGpuFlowDomControlSnapshotPreparationStage({
        domControlSnapshotElementBySurfaceId:
          this.domControlSnapshotElementBySurfaceId,
        domControlSnapshotTextureManager: this.domControlSnapshotTextureManager,
        preparedDomControls,
        selectedResourceKeys,
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
    this.renderBrowserVisualPreparationHosts();
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
        token,
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
      clearGpuFlowVisibleFrameIdentityAttributes(host.element);
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
    publishGpuFlowBrowserVisualDomIslandHostPresentation({
      elementById: this.domIslandElementById,
      registrationCommittedFrameIdById:
        this.domIslandRegistrationCommittedFrameIdById,
      snapshot,
      token,
    });
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

  private isDomControlHostReady(
    control: GpuRetainedDomControlSourceDescriptor,
  ): boolean {
    return describeGpuFlowDomControlHostReadiness({
      context: this.getDomControlReadinessContext(),
      control,
    }).ready;
  }

  private scheduleSnapshotEmit(): void {
    this.snapshotEmitPending = true;
    if (this.snapshotEmitQueued) {
      return;
    }
    this.snapshotEmitQueued = true;
    queueMicrotask(() => {
      this.snapshotEmitQueued = false;
      if (this.listeners.size === 0) {
        return;
      }
      this.snapshotEmitPending = false;
      this.emitSnapshot();
    });
  }

  private emitSnapshot(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private renderBrowserVisualPreparationHosts(): void {
    this.domControlPreparationHostRenderer?.(this.preparationSnapshot);
    this.domControlSnapshotPreparationRenderer?.(this.preparationSnapshot);
    this.domIslandPreparationHostRenderer?.(this.preparationSnapshot);
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
