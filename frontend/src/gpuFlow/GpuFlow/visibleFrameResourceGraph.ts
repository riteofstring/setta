import { isGpuFlowCommittedSurfaceCompletenessBlockingActor } from "../committedSurfaceCompleteness";
import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { SurfaceResourceHandle } from "../surfaceCompositor/surfaceCoverage";
import type { GpuFlowBrowserVisualActorCandidate } from "./browserVisualActorRuntime";
import {
  assertGpuFlowCommitPublicationTokenForFrameId,
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowBlockedVisibleReason,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";

type GpuFlowVisiblePublicationResourceProtectionReport = {
  readonly missingResourceKeys: readonly string[];
  readonly protected: boolean;
  readonly protectedResourceKeys: readonly string[];
  readonly requiredResourceKeys: readonly string[];
};

type GpuFlowVisiblePublicationResourceProtectionDigest = string;

type GpuFlowVisibleFrameCandidateResourceEntry = {
  readonly activeEditorPins: readonly string[];
  readonly browserVisualCandidate: GpuFlowBrowserVisualActorCandidate;
  readonly candidateResourceKeys: readonly string[];
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly requiredResourceKeys: readonly string[];
};

type GpuFlowVisibleFrameCandidateResourceRequest = {
  readonly deadlineFrame: number | null;
  readonly estimatedCostMs: number;
  readonly ownerFrameId: number;
  readonly preparationLane: GpuFlowVisibleFrameResourcePreparationLane;
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly readinessState: "ready" | "requested";
  readonly resourceKey: string;
};

export type GpuFlowVisibleFrameResourceGraphSnapshot = {
  readonly activeEditorPins: readonly string[];
  readonly candidateResourceKeys: readonly string[];
  readonly committedFrameId: number | null;
  readonly committedResourceKeys: readonly string[];
  readonly pendingCandidateFrameIds: readonly number[];
  readonly queuedResourceKeys: readonly string[];
  readonly resourceDebtByState: Record<
    GpuFlowVisibleFrameResourceStateKind,
    number
  >;
  readonly resourceStates: readonly GpuFlowVisibleFrameResourceStateSnapshot[];
};

type GpuFlowVisibleFrameCommittedSurfaceCommitResult = {
  readonly activeEditorPins: readonly string[];
  readonly published: boolean;
  readonly releasedCandidateResourceKeys: readonly string[];
  readonly releasedCommittedResourceKeys: readonly string[];
};

type GpuFlowVisibleFrameCommittedSurfaceAbortResult = {
  readonly activeEditorPins: readonly string[];
  readonly releasedCandidateResourceKeys: readonly string[];
};

export type GpuFlowVisibleFrameResourceWorkTransition = {
  readonly fromState: GpuFlowVisibleFrameResourceStateKind;
  readonly ownerFrameId: number | null;
  readonly resourceKey: string;
  readonly toState: GpuFlowVisibleFrameResourceStateKind;
};

export type GpuFlowVisibleFrameResourceWorkResult = {
  readonly remainingQueuedResourceKeys: readonly string[];
  readonly transitions: readonly GpuFlowVisibleFrameResourceWorkTransition[];
};

type GpuFlowVisibleFrameBrowserVisualCandidateCommitter = (input: {
  readonly candidate: GpuFlowBrowserVisualActorCandidate;
  readonly token: GpuFlowCommitPublicationToken;
}) => void;

type GpuFlowVisibleFrameCommittedSurfaceFramePublisher = (input: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly token: GpuFlowCommitPublicationToken;
}) => boolean;

type GpuFlowVisibleFrameBrowserVisualCandidateAborter = (input: {
  readonly candidate: GpuFlowBrowserVisualActorCandidate;
  readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
}) => void;

export type GpuFlowVisibleFrameResourceStateKind =
  | "absent"
  | "preparing"
  | "presented"
  | "ready"
  | "requested"
  | "retired";

export type GpuFlowVisibleFrameResourceStateSnapshot = {
  readonly debtAgeFrames: number;
  readonly deadlineFrame: number | null;
  readonly estimatedCostMs: number;
  readonly ownerFrameId: number | null;
  readonly preparationLane: GpuFlowVisibleFrameResourcePreparationLane;
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly resourceKey: string;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
};

type GpuFlowVisibleFrameResourceStateEntry =
  GpuFlowVisibleFrameResourceStateSnapshot & {
    readonly requestedAtFrame: number;
    readonly transitionFrame: number;
  };

export type GpuFlowVisibleFrameResourcePreparationLane =
  | "browser-visual"
  | "debug-hit"
  | "dom-island"
  | "maintenance-refinement"
  | "presentation-state"
  | "retained-page"
  | "section-structure"
  | "texture-upload";

export type GpuFlowVisibleFrameResourcePriority =
  | "continuity"
  | "quality"
  | "safety";

export class GpuFlowVisibleFrameResourceGraph {
  private committedFrameId: number | null = null;
  private committedResourceKeys = new Set<string>();
  private readonly pendingCandidateByFrameId = new Map<
    number,
    GpuFlowVisibleFrameCandidateResourceEntry
  >();
  private readonly queuedResourceKeySet = new Set<string>();
  private queuedResourceKeys: string[] = [];
  private readonly resourceStateByKey = new Map<
    string,
    GpuFlowVisibleFrameResourceStateEntry
  >();
  private transitionFrame = 0;

  requestVisibleFrameResource({
    deadlineFrame,
    estimatedCostMs = 1,
    ownerFrameId = null,
    preparationLane = "texture-upload",
    priority = "safety",
    resourceKey,
  }: {
    readonly deadlineFrame?: number | null | undefined;
    readonly estimatedCostMs?: number | undefined;
    readonly ownerFrameId?: number | null | undefined;
    readonly preparationLane?:
      | GpuFlowVisibleFrameResourcePreparationLane
      | undefined;
    readonly priority?: GpuFlowVisibleFrameResourcePriority | undefined;
    readonly resourceKey: string;
  }): void {
    this.transitionResource({
      deadlineFrame,
      estimatedCostMs,
      ownerFrameId,
      preparationLane,
      priority,
      resourceKey,
      state: "requested",
    });
  }

  markVisibleFrameResourcePreparing({
    deadlineFrame,
    estimatedCostMs,
    ownerFrameId = null,
    preparationLane,
    priority,
    resourceKey,
  }: {
    readonly deadlineFrame?: number | null | undefined;
    readonly estimatedCostMs?: number | undefined;
    readonly ownerFrameId?: number | null | undefined;
    readonly preparationLane?:
      | GpuFlowVisibleFrameResourcePreparationLane
      | undefined;
    readonly priority?: GpuFlowVisibleFrameResourcePriority | undefined;
    readonly resourceKey: string;
  }): void {
    this.transitionResource({
      deadlineFrame,
      estimatedCostMs,
      ownerFrameId,
      preparationLane,
      priority,
      resourceKey,
      state: "preparing",
    });
  }

  markVisibleFrameResourceReady({
    deadlineFrame,
    estimatedCostMs,
    ownerFrameId = null,
    preparationLane,
    priority,
    resourceKey,
  }: {
    readonly deadlineFrame?: number | null | undefined;
    readonly estimatedCostMs?: number | undefined;
    readonly ownerFrameId?: number | null | undefined;
    readonly preparationLane?:
      | GpuFlowVisibleFrameResourcePreparationLane
      | undefined;
    readonly priority?: GpuFlowVisibleFrameResourcePriority | undefined;
    readonly resourceKey: string;
  }): void {
    this.transitionResource({
      deadlineFrame,
      estimatedCostMs,
      ownerFrameId,
      preparationLane,
      priority,
      resourceKey,
      state: "ready",
    });
  }

  retireVisibleFrameResource({
    ownerFrameId = null,
    resourceKey,
  }: {
    readonly ownerFrameId?: number | null | undefined;
    readonly resourceKey: string;
  }): void {
    this.transitionResource({
      ownerFrameId,
      resourceKey,
      state: "retired",
    });
  }

  registerPreparedCommittedSurfaceFrame({
    browserVisualCandidate,
    frame,
  }: {
    readonly browserVisualCandidate: GpuFlowBrowserVisualActorCandidate;
    readonly frame: GpuFlowCommittedSurfaceFrame;
  }): void {
    const frameId = getGpuFlowCommittedSurfaceFrameId(frame);
    const entry = createGpuFlowVisibleFrameCandidateResourceEntry({
      browserVisualCandidate,
      frame,
    });
    this.pendingCandidateByFrameId.set(frameId, entry);
    for (const request of createGpuFlowVisibleFrameCandidateResourceRequests({
      entry,
      frameId,
      transitionFrame: this.transitionFrame,
    })) {
      this.requestCandidateResource({
        request,
      });
    }
  }

  advanceVisibleFrameResourceWork({
    maxTransitions = Number.POSITIVE_INFINITY,
    resourceKeys,
  }: {
    readonly maxTransitions?: number | undefined;
    readonly resourceKeys?: readonly string[] | undefined;
  } = {}): GpuFlowVisibleFrameResourceWorkResult {
    if (!Number.isFinite(maxTransitions) && maxTransitions !== Infinity) {
      throw new Error(
        "GPU Flow visible frame resource work requires a finite transition budget or Infinity.",
      );
    }
    if (maxTransitions <= 0) {
      return this.createVisibleFrameResourceWorkResult([]);
    }
    const transitions: GpuFlowVisibleFrameResourceWorkTransition[] = [];
    const resourceWorkKeys =
      resourceKeys === undefined
        ? this.shiftQueuedVisibleFrameResourceWorkKeys(maxTransitions)
        : resourceKeys.slice(0, maxTransitions);
    for (const resourceKey of resourceWorkKeys) {
      this.dequeueVisibleFrameResourceWork(resourceKey);
      const transition = this.advanceQueuedVisibleFrameResource(resourceKey);
      if (transition !== null) {
        transitions.push(transition);
      }
    }
    return this.createVisibleFrameResourceWorkResult(transitions);
  }

  drainVisibleFrameResourceWork(): GpuFlowVisibleFrameResourceWorkResult {
    const transitions: GpuFlowVisibleFrameResourceWorkTransition[] = [];
    while (this.queuedResourceKeys.length > 0) {
      const result = this.advanceVisibleFrameResourceWork();
      transitions.push(...result.transitions);
      if (result.transitions.length === 0) {
        break;
      }
    }
    return this.createVisibleFrameResourceWorkResult(transitions);
  }

  commitPreparedCommittedSurfaceFrame({
    commitBrowserVisualCandidate,
    frame,
    publishCommittedSurfaceFrame,
    token,
  }: {
    readonly commitBrowserVisualCandidate: GpuFlowVisibleFrameBrowserVisualCandidateCommitter;
    readonly frame: GpuFlowCommittedSurfaceFrame;
    readonly publishCommittedSurfaceFrame: GpuFlowVisibleFrameCommittedSurfaceFramePublisher;
    readonly token: GpuFlowCommitPublicationToken;
  }): GpuFlowVisibleFrameCommittedSurfaceCommitResult {
    const frameId = getGpuFlowCommittedSurfaceFrameId(frame);
    assertGpuFlowCommitPublicationTokenForFrameId({
      committedFrameId: frameId,
      token,
    });
    const entry = this.requirePreparedCommittedSurfaceFrame(frame);
    this.assertPreparedCandidateResourcesReady(entry);
    commitBrowserVisualCandidate({
      candidate: entry.browserVisualCandidate,
      token,
    });
    const published = publishCommittedSurfaceFrame({
      frame,
      token,
    });
    this.pendingCandidateByFrameId.delete(frameId);
    const releasedCandidateResourceKeys =
      this.releaseLoserCandidateResourceEntries(frameId);
    const nextCommittedResourceKeys = new Set(entry.candidateResourceKeys);
    const releasedCommittedResourceKeys = [
      ...this.committedResourceKeys,
    ].filter((resourceKey) => !nextCommittedResourceKeys.has(resourceKey));
    for (const resourceKey of releasedCommittedResourceKeys) {
      this.retireVisibleFrameResource({
        ownerFrameId: this.committedFrameId,
        resourceKey,
      });
    }
    for (const resourceKey of nextCommittedResourceKeys) {
      this.transitionResource({
        ownerFrameId: frameId,
        resourceKey,
        state: "presented",
      });
    }
    this.committedFrameId = frameId;
    this.committedResourceKeys = nextCommittedResourceKeys;
    return Object.freeze({
      activeEditorPins: entry.activeEditorPins,
      published,
      releasedCandidateResourceKeys: Object.freeze(
        releasedCandidateResourceKeys,
      ),
      releasedCommittedResourceKeys: Object.freeze(
        releasedCommittedResourceKeys,
      ),
    });
  }

  abortPreparedCommittedSurfaceFrame({
    abortBrowserVisualCandidate,
    frame,
    preservePreparationSnapshot,
    stageBrowserVisualCandidate,
    token,
  }: {
    readonly abortBrowserVisualCandidate: GpuFlowVisibleFrameBrowserVisualCandidateAborter;
    readonly frame: GpuFlowCommittedSurfaceFrame;
    readonly preservePreparationSnapshot: boolean;
    readonly stageBrowserVisualCandidate: GpuFlowVisibleFrameBrowserVisualCandidateAborter;
    readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
  }): GpuFlowVisibleFrameCommittedSurfaceAbortResult | null {
    assertGpuFlowPreparedCandidateAbortToken({ token });
    const frameId = getGpuFlowCommittedSurfaceFrameId(frame);
    const entry = this.pendingCandidateByFrameId.get(frameId);
    if (!entry) {
      return null;
    }
    if (preservePreparationSnapshot) {
      stageBrowserVisualCandidate({
        candidate: entry.browserVisualCandidate,
        token,
      });
    } else {
      abortBrowserVisualCandidate({
        candidate: entry.browserVisualCandidate,
        token,
      });
      for (const resourceKey of entry.candidateResourceKeys) {
        this.retireVisibleFrameResource({
          ownerFrameId: frameId,
          resourceKey,
        });
      }
    }
    this.pendingCandidateByFrameId.delete(frameId);
    return Object.freeze({
      activeEditorPins: entry.activeEditorPins,
      releasedCandidateResourceKeys: entry.candidateResourceKeys,
    });
  }

  getSnapshot(): GpuFlowVisibleFrameResourceGraphSnapshot {
    const pendingEntries = [...this.pendingCandidateByFrameId.values()];
    return Object.freeze({
      activeEditorPins: Object.freeze(
        uniqueStrings(
          pendingEntries.flatMap((entry) => entry.activeEditorPins),
        ),
      ),
      candidateResourceKeys: Object.freeze(
        uniqueStrings(
          pendingEntries.flatMap((entry) => entry.candidateResourceKeys),
        ),
      ),
      committedFrameId: this.committedFrameId,
      committedResourceKeys: Object.freeze([...this.committedResourceKeys]),
      pendingCandidateFrameIds: Object.freeze([
        ...this.pendingCandidateByFrameId.keys(),
      ]),
      queuedResourceKeys: Object.freeze([...this.queuedResourceKeys]),
      resourceDebtByState: createGpuFlowVisibleFrameResourceDebtByStateSnapshot(
        this.resourceStateByKey,
      ),
      resourceStates: Object.freeze(
        [...this.resourceStateByKey.values()]
          .map((entry) =>
            Object.freeze({
              debtAgeFrames: entry.debtAgeFrames,
              deadlineFrame: entry.deadlineFrame,
              estimatedCostMs: entry.estimatedCostMs,
              ownerFrameId: entry.ownerFrameId,
              preparationLane: entry.preparationLane,
              priority: entry.priority,
              resourceKey: entry.resourceKey,
              state: entry.state,
            }),
          )
          .sort((left, right) =>
            left.resourceKey.localeCompare(right.resourceKey),
          ),
      ),
    });
  }

  private requirePreparedCommittedSurfaceFrame(
    frame: GpuFlowCommittedSurfaceFrame,
  ): GpuFlowVisibleFrameCandidateResourceEntry {
    const frameId = getGpuFlowCommittedSurfaceFrameId(frame);
    const entry = this.pendingCandidateByFrameId.get(frameId);
    if (!entry) {
      throw new Error(
        `GPU Flow visible frame resource graph missing prepared candidate resources for committed frame ${frameId}.`,
      );
    }
    return entry;
  }

  private releaseLoserCandidateResourceEntries(
    committedFrameId: number,
  ): readonly string[] {
    const releasedResourceKeys: string[] = [];
    for (const [frameId, entry] of this.pendingCandidateByFrameId) {
      if (frameId === committedFrameId) {
        continue;
      }
      releasedResourceKeys.push(...entry.candidateResourceKeys);
      for (const resourceKey of entry.candidateResourceKeys) {
        this.retireVisibleFrameResource({
          ownerFrameId: frameId,
          resourceKey,
        });
      }
      this.pendingCandidateByFrameId.delete(frameId);
    }
    return uniqueStrings(releasedResourceKeys);
  }

  private requestCandidateResource({
    request,
  }: {
    readonly request: GpuFlowVisibleFrameCandidateResourceRequest;
  }): void {
    const { resourceKey } = request;
    const currentState = this.resourceStateByKey.get(resourceKey)?.state;
    if (currentState === "presented" || currentState === "ready") {
      return;
    }
    if (currentState === "requested" || currentState === "preparing") {
      if (request.readinessState === "ready") {
        this.markCandidateResourceReadyFromOwner({ request });
        return;
      }
      this.enqueueVisibleFrameResourceWork(resourceKey);
      return;
    }
    this.requestVisibleFrameResource(request);
    if (request.readinessState === "ready") {
      this.markVisibleFrameResourcePreparing(request);
      this.markVisibleFrameResourceReady(request);
      return;
    }
    this.enqueueVisibleFrameResourceWork(resourceKey);
  }

  private markCandidateResourceReadyFromOwner({
    request,
  }: {
    readonly request: GpuFlowVisibleFrameCandidateResourceRequest;
  }): void {
    const currentState = this.resourceStateByKey.get(request.resourceKey)?.state;
    if (currentState === "requested") {
      this.markVisibleFrameResourcePreparing(request);
    }
    this.markVisibleFrameResourceReady(request);
    this.dequeueVisibleFrameResourceWork(request.resourceKey);
  }

  private advanceQueuedVisibleFrameResource(
    resourceKey: string,
  ): GpuFlowVisibleFrameResourceWorkTransition | null {
    const current = this.resourceStateByKey.get(resourceKey);
    if (!current) {
      return null;
    }
    switch (current.state) {
      case "requested":
        this.markVisibleFrameResourcePreparing({
          deadlineFrame: current.deadlineFrame,
          estimatedCostMs: current.estimatedCostMs,
          ownerFrameId: current.ownerFrameId,
          preparationLane: current.preparationLane,
          priority: current.priority,
          resourceKey,
        });
        return Object.freeze({
          fromState: "requested" as const,
          ownerFrameId: current.ownerFrameId,
          resourceKey,
          toState: "preparing" as const,
        });
      case "preparing":
      case "absent":
      case "presented":
      case "ready":
      case "retired":
        return null;
    }
  }

  private enqueueVisibleFrameResourceWork(resourceKey: string): void {
    if (this.queuedResourceKeySet.has(resourceKey)) {
      return;
    }
    this.queuedResourceKeySet.add(resourceKey);
    this.queuedResourceKeys.push(resourceKey);
  }

  private dequeueVisibleFrameResourceWork(resourceKey: string): void {
    if (!this.queuedResourceKeySet.delete(resourceKey)) {
      return;
    }
    this.queuedResourceKeys = this.queuedResourceKeys.filter(
      (queuedResourceKey) => queuedResourceKey !== resourceKey,
    );
  }

  private shiftQueuedVisibleFrameResourceWorkKeys(
    maxTransitions: number,
  ): readonly string[] {
    const batchSize = Math.min(maxTransitions, this.queuedResourceKeys.length);
    const resourceKeys = this.queuedResourceKeys.splice(0, batchSize);
    for (const resourceKey of resourceKeys) {
      this.queuedResourceKeySet.delete(resourceKey);
    }
    return Object.freeze(resourceKeys);
  }

  private createVisibleFrameResourceWorkResult(
    transitions: readonly GpuFlowVisibleFrameResourceWorkTransition[],
  ): GpuFlowVisibleFrameResourceWorkResult {
    return Object.freeze({
      remainingQueuedResourceKeys: Object.freeze([...this.queuedResourceKeys]),
      transitions: Object.freeze([...transitions]),
    });
  }

  private assertPreparedCandidateResourcesReady(
    entry: GpuFlowVisibleFrameCandidateResourceEntry,
  ): void {
    const unpreparedResource = entry.candidateResourceKeys.find(
      (resourceKey) => {
        const state = this.resourceStateByKey.get(resourceKey)?.state;
        return state !== "ready" && state !== "presented";
      },
    );
    if (unpreparedResource === undefined) {
      return;
    }
    const state = this.resourceStateByKey.get(unpreparedResource)?.state;
    throw new Error(
      `GPU Flow visible frame resource graph cannot commit frame ${getGpuFlowCommittedSurfaceFrameId(
        entry.frame,
      )} before resource ${unpreparedResource} is ready; current state is ${
        state ?? "absent"
      }.`,
    );
  }

  private transitionResource({
    deadlineFrame,
    estimatedCostMs,
    ownerFrameId,
    preparationLane,
    priority,
    resourceKey,
    state,
  }: {
    readonly deadlineFrame?: number | null | undefined;
    readonly estimatedCostMs?: number | undefined;
    readonly ownerFrameId: number | null;
    readonly preparationLane?:
      | GpuFlowVisibleFrameResourcePreparationLane
      | undefined;
    readonly priority?: GpuFlowVisibleFrameResourcePriority | undefined;
    readonly resourceKey: string;
    readonly state: GpuFlowVisibleFrameResourceStateKind;
  }): void {
    const current = this.resourceStateByKey.get(resourceKey);
    assertGpuFlowVisibleFrameResourceTransition({
      currentState: current?.state ?? "absent",
      nextState: state,
      resourceKey,
    });
    this.transitionFrame += 1;
    const requestedAtFrame =
      state === "requested"
        ? this.transitionFrame
        : current?.requestedAtFrame ?? this.transitionFrame;
    const resolvedPreparationLane =
      preparationLane ??
      current?.preparationLane ??
      inferGpuFlowVisibleFrameResourcePreparationLane(resourceKey);
    const resolvedPriority =
      priority ??
      current?.priority ??
      inferGpuFlowVisibleFrameResourcePriority(resourceKey);
    const resolvedDeadlineFrame =
      deadlineFrame === undefined
        ? (current?.deadlineFrame ??
          createGpuFlowVisibleFrameResourceDeadlineFrame({
            priority: resolvedPriority,
            transitionFrame: this.transitionFrame,
          }))
        : deadlineFrame;
    this.resourceStateByKey.set(
      resourceKey,
      Object.freeze({
        debtAgeFrames:
          state === "requested" || state === "preparing"
            ? this.transitionFrame - requestedAtFrame
            : 0,
        deadlineFrame: resolvedDeadlineFrame,
        estimatedCostMs:
          estimatedCostMs ?? current?.estimatedCostMs ?? estimateGpuFlowVisibleFrameResourceCostMs(resourceKey),
        ownerFrameId,
        preparationLane: resolvedPreparationLane,
        priority: resolvedPriority,
        requestedAtFrame,
        resourceKey,
        state,
        transitionFrame: this.transitionFrame,
      }),
    );
  }
}

export function createGpuFlowVisibleFrameResourceGraph(): GpuFlowVisibleFrameResourceGraph {
  return new GpuFlowVisibleFrameResourceGraph();
}

function createGpuFlowVisibleFrameResourceDebtByStateSnapshot(
  resourceStateByKey: ReadonlyMap<
    string,
    GpuFlowVisibleFrameResourceStateEntry
  >,
): Record<GpuFlowVisibleFrameResourceStateKind, number> {
  const counts = {
    absent: 0,
    preparing: 0,
    presented: 0,
    ready: 0,
    requested: 0,
    retired: 0,
  } satisfies Record<GpuFlowVisibleFrameResourceStateKind, number>;
  for (const entry of resourceStateByKey.values()) {
    counts[entry.state] += 1;
  }
  return Object.freeze(counts);
}

function assertGpuFlowVisibleFrameResourceTransition({
  currentState,
  nextState,
  resourceKey,
}: {
  readonly currentState: GpuFlowVisibleFrameResourceStateKind;
  readonly nextState: GpuFlowVisibleFrameResourceStateKind;
  readonly resourceKey: string;
}): void {
  const allowedNextStates =
    GPU_FLOW_VISIBLE_FRAME_RESOURCE_ALLOWED_TRANSITIONS[currentState];
  if (allowedNextStates.includes(nextState)) {
    return;
  }
  throw new Error(
    `GPU Flow visible frame resource ${resourceKey} cannot transition from ${currentState} to ${nextState}.`,
  );
}

const GPU_FLOW_VISIBLE_FRAME_RESOURCE_ALLOWED_TRANSITIONS = Object.freeze({
  absent: Object.freeze(["requested", "retired"]),
  preparing: Object.freeze(["ready", "retired"]),
  presented: Object.freeze(["presented", "retired"]),
  ready: Object.freeze(["presented", "ready", "retired"]),
  requested: Object.freeze(["preparing", "retired"]),
  retired: Object.freeze(["requested", "retired"]),
} satisfies Record<
  GpuFlowVisibleFrameResourceStateKind,
  readonly GpuFlowVisibleFrameResourceStateKind[]
>);

export function createGpuFlowVisiblePublicationResourceProtectionReport(
  committedFrame: GpuFlowCommittedSurfaceFrame | null,
): GpuFlowVisiblePublicationResourceProtectionReport {
  if (committedFrame === null) {
    return createGpuFlowVisiblePublicationResourceProtectionReportFromKeys({
      protectedResourceKeys: [],
      requiredResourceKeys: [],
    });
  }
  return createGpuFlowVisiblePublicationResourceProtectionReportFromKeys({
    protectedResourceKeys:
      createGpuFlowVisiblePublicationProtectedResourceKeys(committedFrame),
    requiredResourceKeys:
      createGpuFlowVisiblePublicationRequiredResourceKeys(committedFrame),
  });
}

export function createGpuFlowVisiblePublicationResourceBlockedReasons(
  committedFrame: GpuFlowCommittedSurfaceFrame,
): readonly GpuFlowBlockedVisibleReason[] {
  return Object.freeze(
    createGpuFlowVisiblePublicationResourceProtectionReport(
      committedFrame,
    ).missingResourceKeys.map((resourceKey) =>
      Object.freeze({
        actorId: null,
        family: "resource-protection",
        reason: `missing-protected-resource:${resourceKey}`,
      }),
    ),
  );
}

export function createGpuFlowVisiblePublicationResourceProtectionDigest(
  report: GpuFlowVisiblePublicationResourceProtectionReport,
): GpuFlowVisiblePublicationResourceProtectionDigest {
  return JSON.stringify({
    missingResourceKeys: [...report.missingResourceKeys].sort(),
    protected: report.protected,
    protectedResourceKeys: [...report.protectedResourceKeys].sort(),
    requiredResourceKeys: [...report.requiredResourceKeys].sort(),
  });
}

export function assertGpuFlowVisiblePublicationResourcesProtected(
  report: GpuFlowVisiblePublicationResourceProtectionReport,
): void {
  if (report.protected) {
    return;
  }
  throw new Error(
    `GPU Flow visible publication proof requires protected resources for all actor proofs: ${report.missingResourceKeys.join(
      ", ",
    )}.`,
  );
}

function createGpuFlowVisiblePublicationResourceProtectionReportFromKeys({
  protectedResourceKeys,
  requiredResourceKeys,
}: {
  readonly protectedResourceKeys: readonly string[];
  readonly requiredResourceKeys: readonly string[];
}): GpuFlowVisiblePublicationResourceProtectionReport {
  const protectedResourceKeySet = new Set(protectedResourceKeys);
  const missingResourceKeys = [
    ...new Set(
      requiredResourceKeys.filter(
        (resourceKey) => !protectedResourceKeySet.has(resourceKey),
      ),
    ),
  ];
  return Object.freeze({
    missingResourceKeys: Object.freeze(missingResourceKeys),
    protected: missingResourceKeys.length === 0,
    protectedResourceKeys: Object.freeze([...new Set(protectedResourceKeys)]),
    requiredResourceKeys: Object.freeze([...new Set(requiredResourceKeys)]),
  });
}

function createGpuFlowVisiblePublicationRequiredResourceKeys(
  committedFrame: GpuFlowCommittedSurfaceFrame,
): readonly string[] {
  return createGpuFlowVisiblePublicationResourceKeys(
    getGpuFlowVisiblePublicationRequiredResourceHandles(committedFrame),
  );
}

function createGpuFlowVisiblePublicationProtectedResourceKeys(
  committedFrame: GpuFlowCommittedSurfaceFrame,
): readonly string[] {
  return createGpuFlowVisiblePublicationResourceKeys([
    ...(committedFrame.surfaceTransaction?.protectedResourceHandles ?? []),
    ...(committedFrame.surfaceTransaction?.coverageProof
      .protectedResourceHandles ?? []),
  ]);
}

function getGpuFlowVisiblePublicationRequiredResourceHandles(
  committedFrame: GpuFlowCommittedSurfaceFrame,
): readonly SurfaceResourceHandle[] {
  return [
    ...committedFrame.actorGenerations.flatMap((actor) =>
      getGpuFlowVisiblePublicationActorRequiredResourceHandles({
        actor,
        startup: committedFrame.retainedDisplayFrame === null,
      }),
    ),
    ...(committedFrame.surfaceTransaction?.coverageProof.exactCoverage.flatMap(
      (entry) => entry.resourceHandles,
    ) ?? []),
    ...(committedFrame.surfaceTransaction?.coverageProof.compatibleCoverage.flatMap(
      (entry) => entry.resourceHandles,
    ) ?? []),
  ];
}

function getGpuFlowVisiblePublicationActorRequiredResourceHandles({
  actor,
  startup,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly startup: boolean;
}): readonly SurfaceResourceHandle[] {
  if (
    !isGpuFlowCommittedSurfaceCompletenessBlockingActor({
      actor,
      startup,
    })
  ) {
    return [];
  }
  if (actor.kind === "dom-control") {
    return [];
  }
  return [
    ...(actor.browserVisual?.resourceHandles ?? []),
    ...(actor.textCoverageProof?.projectionCoverage === "compatible-previous"
      ? actor.textCoverageProof.compatiblePreviousProof.resourceHandles
      : []),
  ];
}

function createGpuFlowVisiblePublicationResourceKeys(
  resourceHandles: readonly SurfaceResourceHandle[],
): readonly string[] {
  return resourceHandles.map(createGpuFlowVisiblePublicationResourceKey);
}

function createGpuFlowVisiblePublicationResourceKey(
  handle: SurfaceResourceHandle,
): string {
  return `${handle.kind}:${handle.id}`;
}

function createGpuFlowVisibleFrameCandidateResourceRequests({
  entry,
  frameId,
  transitionFrame,
}: {
  readonly entry: GpuFlowVisibleFrameCandidateResourceEntry;
  readonly frameId: number;
  readonly transitionFrame: number;
}): readonly GpuFlowVisibleFrameCandidateResourceRequest[] {
  const requestByKey = new Map<
    string,
    GpuFlowVisibleFrameCandidateResourceRequest
  >();
  for (const resourceKey of entry.requiredResourceKeys) {
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane: inferGpuFlowVisibleFrameResourcePreparationLane(
          resourceKey,
        ),
        priority: "safety",
        readinessState: "ready",
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  for (const control of entry.browserVisualCandidate.snapshot.domControls
    .mountedControls) {
    const resourceKey = `dom-control:${control.sourceId}`;
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane: "browser-visual",
        priority: "safety",
        readinessState: getGpuFlowBrowserVisualResourceReadinessState({
          actorId: control.sourceId,
          readinessByActorId:
            entry.browserVisualCandidate.readiness
              .domControlReadinessByActorId,
          resourceKey,
        }),
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  for (const control of entry.browserVisualCandidate.snapshot.domControls
    .snapshotControls) {
    const resourceKey = `dom-control-snapshot:${
      control.snapshotSurfaceId ?? control.sourceId
    }`;
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane: "browser-visual",
        priority: "safety",
        readinessState: getGpuFlowBrowserVisualResourceReadinessState({
          actorId: control.sourceId,
          readinessByActorId:
            entry.browserVisualCandidate.readiness
              .domControlReadinessByActorId,
          resourceKey,
        }),
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  for (const island of entry.browserVisualCandidate.snapshot.domIslands
    .islands) {
    const resourceKey = `dom-island:${island.id}`;
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane: "dom-island",
        priority: "safety",
        readinessState: getGpuFlowBrowserVisualResourceReadinessState({
          actorId: island.id,
          readinessByActorId:
            entry.browserVisualCandidate.readiness.domIslandReadinessByActorId,
          resourceKey,
        }),
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  for (const resourceKey of entry.candidateResourceKeys) {
    if (requestByKey.has(resourceKey)) {
      continue;
    }
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane: inferGpuFlowVisibleFrameResourcePreparationLane(
          resourceKey,
        ),
        priority: inferGpuFlowVisibleFrameResourcePriority(resourceKey),
        readinessState: "ready",
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  return Object.freeze(
    entry.candidateResourceKeys.map((resourceKey) => {
      const request = requestByKey.get(resourceKey);
      if (!request) {
        throw new Error(
          `GPU Flow visible frame resource graph missing resource request metadata for ${resourceKey}.`,
        );
      }
      return request;
    }),
  );
}

function createGpuFlowVisibleFrameCandidateResourceRequest({
  frameId,
  preparationLane,
  priority,
  readinessState,
  resourceKey,
  transitionFrame,
}: {
  readonly frameId: number;
  readonly preparationLane: GpuFlowVisibleFrameResourcePreparationLane;
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly readinessState: "ready" | "requested";
  readonly resourceKey: string;
  readonly transitionFrame: number;
}): GpuFlowVisibleFrameCandidateResourceRequest {
  return Object.freeze({
    deadlineFrame: createGpuFlowVisibleFrameResourceDeadlineFrame({
      priority,
      transitionFrame,
    }),
    estimatedCostMs: estimateGpuFlowVisibleFrameResourceCostMs(resourceKey),
    ownerFrameId: frameId,
    preparationLane,
    priority,
    readinessState,
    resourceKey,
  });
}

function setGpuFlowVisibleFrameCandidateResourceRequest({
  request,
  requestByKey,
}: {
  readonly request: GpuFlowVisibleFrameCandidateResourceRequest;
  readonly requestByKey: Map<string, GpuFlowVisibleFrameCandidateResourceRequest>;
}): void {
  if (requestByKey.has(request.resourceKey)) {
    throw new Error(
      `GPU Flow visible frame resource graph received duplicate resource request metadata for ${request.resourceKey}.`,
    );
  }
  requestByKey.set(request.resourceKey, request);
}

function getGpuFlowBrowserVisualResourceReadinessState({
  actorId,
  readinessByActorId,
  resourceKey,
}: {
  readonly actorId: string;
  readonly readinessByActorId: ReadonlyMap<
    string,
    { readonly coverageState: string }
  >;
  readonly resourceKey: string;
}): GpuFlowVisibleFrameCandidateResourceRequest["readinessState"] {
  const readiness = readinessByActorId.get(actorId);
  if (!readiness) {
    throw new Error(
      `GPU Flow visible frame resource graph missing browser visual readiness for ${resourceKey}.`,
    );
  }
  return GPU_FLOW_BLOCKED_BROWSER_VISUAL_RESOURCE_COVERAGE_STATES.has(
    readiness.coverageState,
  )
    ? "requested"
    : "ready";
}

const GPU_FLOW_BLOCKED_BROWSER_VISUAL_RESOURCE_COVERAGE_STATES = new Set([
  "blocked-awaiting-browser-visual",
  "blocked-awaiting-live-host",
  "blocked-awaiting-snapshot",
]);

function createGpuFlowVisibleFrameResourceDeadlineFrame({
  priority,
  transitionFrame,
}: {
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly transitionFrame: number;
}): number {
  switch (priority) {
    case "safety":
      return transitionFrame + 1;
    case "continuity":
      return transitionFrame + 2;
    case "quality":
      return transitionFrame + 6;
  }
}

function estimateGpuFlowVisibleFrameResourceCostMs(resourceKey: string): number {
  if (resourceKey.startsWith("dom-control-snapshot:")) {
    return 1.5;
  }
  if (resourceKey.startsWith("dom-control:")) {
    return 0.5;
  }
  if (resourceKey.startsWith("dom-island:")) {
    return 1;
  }
  if (resourceKey.startsWith("page:")) {
    return 2;
  }
  if (resourceKey.startsWith("texture:")) {
    return 1.5;
  }
  if (resourceKey.startsWith("source:")) {
    return 0.75;
  }
  return 1;
}

function inferGpuFlowVisibleFrameResourcePreparationLane(
  resourceKey: string,
): GpuFlowVisibleFrameResourcePreparationLane {
  if (
    resourceKey.startsWith("dom-control:") ||
    resourceKey.startsWith("dom-control-snapshot:")
  ) {
    return "browser-visual";
  }
  if (resourceKey.startsWith("dom-island:")) {
    return "dom-island";
  }
  if (resourceKey.startsWith("page:") || resourceKey.startsWith("source:")) {
    return "retained-page";
  }
  if (resourceKey.startsWith("texture:")) {
    return "texture-upload";
  }
  return "maintenance-refinement";
}

function inferGpuFlowVisibleFrameResourcePriority(
  resourceKey: string,
): GpuFlowVisibleFrameResourcePriority {
  if (
    resourceKey.startsWith("dom-control:") ||
    resourceKey.startsWith("dom-control-snapshot:") ||
    resourceKey.startsWith("dom-island:") ||
    resourceKey.startsWith("page:") ||
    resourceKey.startsWith("source:") ||
    resourceKey.startsWith("texture:")
  ) {
    return "safety";
  }
  return "quality";
}

function createGpuFlowVisibleFrameCandidateResourceEntry({
  browserVisualCandidate,
  frame,
}: {
  readonly browserVisualCandidate: GpuFlowBrowserVisualActorCandidate;
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): GpuFlowVisibleFrameCandidateResourceEntry {
  const requiredResourceKeys =
    createGpuFlowVisiblePublicationRequiredResourceKeys(frame);
  return Object.freeze({
    activeEditorPins: Object.freeze(
      createGpuFlowVisibleFrameCandidateActiveEditorPins(
        browserVisualCandidate,
      ),
    ),
    browserVisualCandidate,
    candidateResourceKeys: Object.freeze(
      uniqueStrings([
        ...requiredResourceKeys,
        ...createGpuFlowBrowserVisualCandidateResourceKeys(
          browserVisualCandidate,
        ),
      ]),
    ),
    frame,
    requiredResourceKeys: Object.freeze(uniqueStrings(requiredResourceKeys)),
  });
}

function createGpuFlowBrowserVisualCandidateResourceKeys(
  candidate: GpuFlowBrowserVisualActorCandidate,
): readonly string[] {
  return uniqueStrings([
    ...candidate.snapshot.domControls.mountedControls.map(
      (control) => `dom-control:${control.sourceId}`,
    ),
    ...candidate.snapshot.domControls.snapshotControls.map(
      (control) =>
        `dom-control-snapshot:${control.snapshotSurfaceId ?? control.sourceId}`,
    ),
    ...candidate.snapshot.domIslands.islands.map(
      (island) => `dom-island:${island.id}`,
    ),
  ]);
}

function createGpuFlowVisibleFrameCandidateActiveEditorPins(
  candidate: GpuFlowBrowserVisualActorCandidate,
): readonly string[] {
  return uniqueStrings(
    candidate.snapshot.domControls.controls
      .filter(
        (control) =>
          control.active ||
          control.visualSemantics.accessibility === "active-browser-editor" ||
          control.textCoverageState.caret === "visible" ||
          control.textCoverageState.composition === "active" ||
          control.textCoverageState.selection !== "none",
      )
      .map((control) => control.sourceId),
  );
}

function getGpuFlowCommittedSurfaceFrameId(
  frame: GpuFlowCommittedSurfaceFrame,
): number {
  if (!Number.isFinite(frame.displayFrameId)) {
    throw new Error(
      "GPU Flow visible frame resource graph requires a numeric committed frame id.",
    );
  }
  return frame.displayFrameId;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
