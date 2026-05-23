import { createGpuFlowDomControlSnapshotResourceHandle } from "../browserSnapshotResourceHandle";
import type { GpuFlowCommittedSurfaceBrowserVisualReadiness } from "../committedSurfaceFrame";
import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type {
  CommittedHtmlSurfaceTextureSnapshot,
  HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type {
  GpuRetainedDomControlSourceDescriptor,
  GpuRetainedDomControlTextCoverageState,
} from "../retainedDomControlScene";
import type { GpuDomIsland } from "../scene";
import type { BrowserVisualActorRepresentationReadiness } from "../surfaceCompositor/browserVisualActorAdapter";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  areBrowserVisualActorRuntimeSnapshotsEqual,
  addSetValue,
  blurFocusedDescendantBeforeUnmount,
  createGpuFlowCompatiblePreviousDomControlReadiness,
  createGpuFlowDomControlProjectionSourceRevision,
  deleteSetValue,
  isProjectableDomControlAssignment,
  mergeGpuFlowDomControlProjectedControls,
  parkDomControlElement,
  resolveGpuFlowBrowserVisualActorFrameIds,
  syncGpuFlowBrowserVisualDomIslandLayerStyles,
} from "./browserVisualActorRuntimeHelpers";
import {
  getDomControlHostSelectionState,
  isDomControlHostFocused,
} from "./browserVisualActorTextCoverage";
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
  createGpuRetainedDomControlTextCoverageState,
  withGpuRetainedDomControlTextCoverageState,
} from "./retainedDomControlSourceKeys";
import { getGpuRetainedDomControlResolvedSnapshotSurfaceId } from "./retainedDomControlSources";
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
};

type BrowserVisualActorRuntimeListener = () => void;
type GpuFlowBrowserVisualActorProjectionInput =
  | GpuViewportInput
  | {
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
const BLOCKED_AWAITING_LIVE_HOST_READINESS: BrowserVisualActorRepresentationReadiness =
  Object.freeze({ coverageState: "blocked-awaiting-live-host" });
const BLOCKED_AWAITING_SNAPSHOT_READINESS: BrowserVisualActorRepresentationReadiness =
  Object.freeze({ coverageState: "blocked-awaiting-snapshot" });
const GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_PREPARATION_BATCH_SIZE = 8;
const GPU_FLOW_FOCUSED_DOM_CONTROL_VISUAL_SEMANTICS = Object.freeze({
  accessibility: "active-browser-editor",
  focusable: true,
  pointer: "active-browser-editor",
  selectable: "browser-editor",
} satisfies GpuRetainedDomControlSourceDescriptor["visualSemantics"]);

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

function createBlockedDomControlReadiness(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserVisualActorRepresentationReadiness {
  if (control.visualPolicy === "snapshot") {
    return BLOCKED_AWAITING_SNAPSHOT_READINESS;
  }
  return BLOCKED_AWAITING_LIVE_HOST_READINESS;
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
  if (projectionInput === undefined) {
    throw new Error(
      "GPU Flow current browser visual projection requires a commit publication token.",
    );
  }
  if (isGpuFlowBrowserVisualActorProjectionTokenInput(projectionInput)) {
    assertGpuFlowCommitPublicationTokenForFrameId({
      committedFrameId,
      token: projectionInput.token,
    });
    return projectionInput.viewport;
  }
  return projectionInput;
}

function isGpuFlowBrowserVisualActorProjectionTokenInput(
  projectionInput: GpuFlowBrowserVisualActorProjectionInput,
): projectionInput is Extract<
  GpuFlowBrowserVisualActorProjectionInput,
  { readonly token: GpuFlowCommitPublicationToken }
> {
  return (
    typeof projectionInput === "object" &&
    projectionInput !== null &&
    "token" in projectionInput
  );
}

export class GpuFlowBrowserVisualActorRuntime {
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
  }: {
    readonly retainedDisplayFrame: RetainedDisplayFrame;
  }): GpuFlowBrowserVisualActorCandidate {
    const retainedRuntimeFrame = retainedDisplayFrame.retainedRuntimeFrame;
    const frameIds = resolveGpuFlowBrowserVisualActorFrameIds({
      committedFrameId: retainedDisplayFrame.id,
      retainedRuntimeFrame,
    });
    const controls = this.withFocusedDomControlPins(
      retainedRuntimeFrame.descriptors.domControlSources,
    );
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
      viewport: undefined,
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
    });
    const readiness = Object.freeze({
      domControlReadinessByActorId:
        this.createDomControlReadinessByActorId(preparedDomControls),
      domIslandReadinessByActorId: this.createDomIslandReadinessByActorId(
        retainedRuntimeFrame.descriptors.nativeDomIslands ?? EMPTY_DOM_ISLANDS,
      ),
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
    });
  }

  commitPreparedBrowserVisualActors({
    candidate,
    token,
  }: {
    readonly candidate: GpuFlowBrowserVisualActorCandidate;
    readonly token: GpuFlowCommitPublicationToken;
  }): void {
    this.publishBrowserVisualSnapshot({
      nextSnapshot: candidate.snapshot,
      token,
    });
    this.projectionManager.commitPromotedRepresentations(
      candidate.snapshot.domControls.assignments,
    );
    if (
      this.preparationSnapshot.frameIds.committedFrameId ===
        candidate.snapshot.frameIds.committedFrameId &&
      this.preparationSnapshot.frameIds.runtimeFrameId ===
        candidate.snapshot.frameIds.runtimeFrameId
    ) {
      this.preparationSnapshot = createEmptyBrowserVisualActorRuntimeSnapshot();
      this.emitPreparation();
    } else if (
      this.preparationSnapshot.frameIds.committedFrameId !== 0 ||
      this.preparationSnapshot.frameIds.runtimeFrameId !== 0
    ) {
      this.preparationSnapshot = createEmptyBrowserVisualActorRuntimeSnapshot();
      this.emitPreparation();
    }
    this.projectDomControls({ token });
    this.projectDomIslands({ token });
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
      this.composingDomControlIds.delete(control.sourceId);
      return;
    }
    this.domControlHostById.set(control.sourceId, {
      control,
      controlId: control.sourceId,
      element,
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
  }

  projectDomControls(
    projectionInput?: GpuFlowBrowserVisualActorProjectionInput,
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

  projectDomIslands(
    projectionInput?: GpuFlowBrowserVisualActorProjectionInput,
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
  }: {
    readonly preparedSnapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
  }): void {
    const preparedDomControls = preparedSnapshot.domControls;
    const mountedControls = mergeGpuFlowDomControlProjectedControls({
      controlById: preparedDomControls.controlById,
      currentControls: this.snapshot.domControls.mountedControls,
      nextControls: preparedDomControls.mountedControls,
    });
    const nextPreparationSnapshot: GpuFlowBrowserVisualActorRuntimeSnapshot =
      Object.freeze({
        domControls: Object.freeze({
          ...preparedDomControls,
          mountedControls: Object.freeze([...mountedControls]),
          snapshotControls: Object.freeze([
            ...preparedDomControls.snapshotControls,
          ]),
        }),
        domIslands: preparedSnapshot.domIslands,
        frameIds: preparedSnapshot.frameIds,
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
  }): void {
    assertGpuFlowCommitPublicationTokenForFrameId({
      committedFrameId: nextSnapshot.frameIds.committedFrameId,
      token,
    });
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

  private resolveDomControlSnapshotPreparationPool(
    assignments: readonly GpuFlowDomControlProjectionAssignment[],
  ): readonly GpuRetainedDomControlSourceDescriptor[] {
    const readyControls: GpuRetainedDomControlSourceDescriptor[] = [];
    const pendingControls: GpuRetainedDomControlSourceDescriptor[] = [];
    for (const assignment of assignments) {
      if (!isDomControlSnapshotPreparationAssignment(assignment)) {
        continue;
      }
      if (this.isDomControlSnapshotReady(assignment.control)) {
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

  private withFocusedDomControlPins(
    controls: readonly GpuRetainedDomControlSourceDescriptor[],
  ): readonly GpuRetainedDomControlSourceDescriptor[] {
    let changed = false;
    const pinnedControls = controls.map((control) => {
      const textCoverageState =
        this.getRuntimeDomControlTextCoverageState(control);
      const textStateChanged =
        control.textCoverageState.caret !== textCoverageState.caret ||
        control.textCoverageState.composition !==
          textCoverageState.composition ||
        control.textCoverageState.selection !== textCoverageState.selection;
      const shouldPinActive =
        control.active ||
        textCoverageState.caret === "visible" ||
        textCoverageState.composition === "active" ||
        textCoverageState.selection !== "none";
      if (!shouldPinActive && !textStateChanged) {
        return control;
      }
      changed = true;
      const nextControl = shouldPinActive
        ? ({
            ...control,
            active: true,
            layerSlot: "active-dom-control-plane",
            lifecycleState: "active-projected",
            visualSemantics: GPU_FLOW_FOCUSED_DOM_CONTROL_VISUAL_SEMANTICS,
          } satisfies GpuRetainedDomControlSourceDescriptor)
        : control;
      return withGpuRetainedDomControlTextCoverageState(
        nextControl,
        textCoverageState,
      );
    });
    return changed ? Object.freeze(pinnedControls) : controls;
  }

  private getRuntimeDomControlTextCoverageState(
    control: GpuRetainedDomControlSourceDescriptor,
  ): GpuRetainedDomControlTextCoverageState {
    const host = this.domControlHostById.get(control.sourceId);
    const focused = host ? isDomControlHostFocused(host.element) : false;
    const composing = this.composingDomControlIds.has(control.sourceId);
    if (!control.active && !focused && !composing) {
      return createGpuRetainedDomControlTextCoverageState(false);
    }
    const selection = host
      ? getDomControlHostSelectionState(host.element, focused)
      : "collapsed";
    return {
      caret: "visible",
      composition: composing ? "active" : "inactive",
      selection,
    };
  }

  private createDomControlReadinessByActorId(
    preparedDomControls: GpuFlowBrowserVisualActorRuntimeSnapshot["domControls"],
  ): ReadonlyMap<string, BrowserVisualActorRepresentationReadiness> {
    const assignmentByControlId = new Map(
      preparedDomControls.assignments.map((assignment) => [
        assignment.control.sourceId,
        assignment,
      ]),
    );
    const readinessByActorId = new Map<
      string,
      BrowserVisualActorRepresentationReadiness
    >();
    for (const control of preparedDomControls.controls) {
      const assignment = assignmentByControlId.get(control.sourceId);
      readinessByActorId.set(
        control.sourceId,
        this.createDomControlReadiness({ assignment, control }),
      );
    }
    return readinessByActorId;
  }

  private createDomControlReadiness({
    assignment,
    control,
  }: {
    readonly assignment: GpuFlowDomControlProjectionAssignment | undefined;
    readonly control: GpuRetainedDomControlSourceDescriptor;
  }): BrowserVisualActorRepresentationReadiness {
    if (!assignment) {
      return createBlockedDomControlReadiness(control);
    }
    switch (assignment.coverageState) {
      case "live":
        return this.createLiveDomControlReadiness(control);
      case "snapshot":
        return this.createSnapshotDomControlReadiness(control);
      case "compatible-previous":
        return (
          createGpuFlowCompatiblePreviousDomControlReadiness({ assignment }) ??
          createBlockedDomControlReadiness(control)
        );
      case "blocked-awaiting-browser-visual":
        return BLOCKED_AWAITING_SNAPSHOT_READINESS;
      case "blocked-awaiting-live-host":
        return this.createBlockedLiveHostDomControlReadiness({
          control,
          reason: assignment.reason,
        });
      case "true-hole":
        return Object.freeze({ coverageState: "true-hole" });
    }
  }

  private createBlockedLiveHostDomControlReadiness({
    control,
    reason,
  }: {
    readonly control: GpuRetainedDomControlSourceDescriptor;
    readonly reason: GpuFlowDomControlProjectionAssignment["reason"];
  }): BrowserVisualActorRepresentationReadiness {
    if (reason === "near-future-live") {
      return Object.freeze({ coverageState: "coverage-exempt" });
    }
    if (reason === "live-host-overflow" && !control.active) {
      return this.createSnapshotDomControlReadiness(control);
    }
    return BLOCKED_AWAITING_LIVE_HOST_READINESS;
  }

  private createLiveDomControlReadiness(
    control: GpuRetainedDomControlSourceDescriptor,
  ): BrowserVisualActorRepresentationReadiness {
    if (!this.isDomControlHostReady(control)) {
      return Object.freeze({ coverageState: "blocked-awaiting-live-host" });
    }
    return Object.freeze({
      coverageState: "live-host-ready",
      resourceHandles: Object.freeze([
        Object.freeze({
          id: control.sourceId,
          kind: "source" as const,
        }),
      ]),
    });
  }

  private createSnapshotDomControlReadiness(
    control: GpuRetainedDomControlSourceDescriptor,
  ): BrowserVisualActorRepresentationReadiness {
    const texture = this.getReadyDomControlSnapshotTexture(control);
    if (!texture) {
      return Object.freeze({ coverageState: "blocked-awaiting-snapshot" });
    }
    return Object.freeze({
      coverageState: "exact-snapshot-ready",
      resourceHandles: Object.freeze([
        createGpuFlowDomControlSnapshotResourceHandle({
          control,
          texture,
        }),
      ]),
    });
  }

  private createDomIslandReadinessByActorId(
    islands: readonly GpuDomIsland[],
  ): ReadonlyMap<string, BrowserVisualActorRepresentationReadiness> {
    const readinessByActorId = new Map<
      string,
      BrowserVisualActorRepresentationReadiness
    >();
    for (const island of islands) {
      const element = this.domIslandElementById.get(island.id);
      readinessByActorId.set(
        island.id,
        element?.isConnected
          ? Object.freeze({
              coverageState: "live-host-ready",
              resourceHandles: Object.freeze([
                Object.freeze({
                  id: island.id,
                  kind: "native-dom-island" as const,
                }),
              ]),
            })
          : Object.freeze({ coverageState: "blocked-awaiting-live-host" }),
      );
    }
    return readinessByActorId;
  }

  private isDomControlHostReady(
    control: GpuRetainedDomControlSourceDescriptor,
  ): boolean {
    const host = this.domControlHostById.get(control.sourceId);
    return Boolean(
      host &&
        host.element.isConnected &&
        host.control.sourceId === control.sourceId &&
        host.control.sourceKey === control.sourceKey &&
        host.control.snapshotCacheKeyRevision ===
          control.snapshotCacheKeyRevision &&
        host.control.textCoverageRevision === control.textCoverageRevision &&
        host.control.valueStyleRevision === control.valueStyleRevision &&
        host.control.geometryRevision === control.geometryRevision &&
        host.control.clipChainRevision === control.clipChainRevision,
    );
  }

  private isDomControlSnapshotReady(
    control: GpuRetainedDomControlSourceDescriptor,
  ): boolean {
    return this.getReadyDomControlSnapshotTexture(control) !== null;
  }

  private getReadyDomControlSnapshotTexture(
    control: GpuRetainedDomControlSourceDescriptor,
  ): CommittedHtmlSurfaceTextureSnapshot | null {
    const snapshotSurfaceId =
      getGpuRetainedDomControlResolvedSnapshotSurfaceId(control);
    const element =
      this.domControlSnapshotElementBySurfaceId.get(snapshotSurfaceId);
    if (!element?.isConnected) {
      return null;
    }
    const texture =
      this.domControlSnapshotTextureManager?.getCommittedSurfaceTexture(
        snapshotSurfaceId,
      );
    if (
      texture &&
      texture.lastUploadFrame >= 0 &&
      !texture.dirtyContent &&
      !texture.dirtyResolution &&
      texture.textureContentKey === control.snapshotCacheKeyRevision
    ) {
      return texture;
    }
    return null;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private emitPreparation(): void {
    for (const listener of this.preparationListeners) {
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
      snapshotControls: EMPTY_DOM_CONTROL_DESCRIPTORS,
      sourceRevision: "",
    }),
    domIslands: Object.freeze({
      islands: EMPTY_DOM_ISLANDS,
    }),
    frameIds,
  });
}

function isDomControlSnapshotPreparationAssignment(
  assignment: GpuFlowDomControlProjectionAssignment,
): boolean {
  return (
    assignment.coverageState === "snapshot" ||
    (assignment.coverageState === "blocked-awaiting-live-host" &&
      assignment.reason === "live-host-overflow" &&
      !assignment.control.active)
  );
}
