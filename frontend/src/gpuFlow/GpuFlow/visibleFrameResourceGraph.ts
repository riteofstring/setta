import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowBrowserVisualActorCandidate } from "./browserVisualActorRuntime";
import {
  assertGpuFlowCommitPublicationTokenForFrameId,
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";
import {
  createGpuFlowVisibleFrameCandidateResourceEntry,
  createGpuFlowVisibleFrameCandidateResourceRequests,
  createGpuFlowVisibleFrameResourceDeadlineFrame,
  estimateGpuFlowVisibleFrameResourceCostMs,
  inferGpuFlowVisibleFrameResourcePreparationLane,
  inferGpuFlowVisibleFrameResourcePriority,
  type GpuFlowVisibleFrameCandidateResourceEntry,
  type GpuFlowVisibleFrameCandidateResourceRequest,
} from "./visibleFrameResourceGraphResources";

export {
  assertGpuFlowVisiblePublicationResourcesProtected,
  createGpuFlowVisiblePublicationResourceBlockedReasons,
  createGpuFlowVisiblePublicationResourceProtectionDigest,
  createGpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFrameResourceGraphResources";
export type {
  GpuFlowVisiblePublicationResourceProtectionDigest,
  GpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFrameResourceGraphResources";

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
  readonly selectedResourceKeys?: readonly string[] | undefined;
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

type GpuFlowVisibleFrameResourceTransitionInput = {
  readonly deadlineFrame?: number | null | undefined;
  readonly estimatedCostMs?: number | undefined;
  readonly ownerFrameId: number | null;
  readonly preparationLane?:
    | GpuFlowVisibleFrameResourcePreparationLane
    | undefined;
  readonly priority?: GpuFlowVisibleFrameResourcePriority | undefined;
  readonly resourceKey: string;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
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
    this.dequeueVisibleFrameResourceWork(resourceKey);
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

  advanceVisibleFrameResourceWork(input?: {
    readonly maxTransitions?: number | undefined;
    readonly resourceKeys: readonly string[];
  }): GpuFlowVisibleFrameResourceWorkResult {
    if (!input) {
      throw new Error(
        "GPU Flow visible frame resource work requires budget-selected resource keys.",
      );
    }
    const { maxTransitions = Number.POSITIVE_INFINITY, resourceKeys } = input;
    if (!Number.isFinite(maxTransitions) && maxTransitions !== Infinity) {
      throw new Error(
        "GPU Flow visible frame resource work requires a finite transition budget or Infinity.",
      );
    }
    if (maxTransitions <= 0) {
      return this.createVisibleFrameResourceWorkResult([]);
    }
    const transitions: GpuFlowVisibleFrameResourceWorkTransition[] = [];
    const resourceWorkKeys = resourceKeys.slice(0, maxTransitions);
    for (const resourceKey of resourceWorkKeys) {
      this.dequeueVisibleFrameResourceWork(resourceKey);
      const transition = this.advanceQueuedVisibleFrameResource(resourceKey);
      if (transition !== null) {
        transitions.push(transition);
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
    this.assertPreparedCandidateRequiredResourcesReady(entry);
    commitBrowserVisualCandidate({
      candidate: entry.browserVisualCandidate,
      token,
    });
    const published = publishCommittedSurfaceFrame({
      frame,
      token,
    });
    this.pendingCandidateByFrameId.delete(frameId);
    const nextCommittedResourceKeys = new Set(
      this.getPresentableCandidateResourceKeys(entry),
    );
    const releasedCandidateResourceKeys = uniqueStrings([
      ...this.releaseUnpresentedCandidateResourceEntries(
        frameId,
        entry,
        nextCommittedResourceKeys,
      ),
      ...this.releaseLoserCandidateResourceEntries(
        frameId,
        nextCommittedResourceKeys,
      ),
    ]);
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
    browserVisualPreparationResourceKeys,
    frame,
    preservePreparationSnapshot,
    stageBrowserVisualCandidate,
    token,
  }: {
    readonly abortBrowserVisualCandidate: GpuFlowVisibleFrameBrowserVisualCandidateAborter;
    readonly browserVisualPreparationResourceKeys?:
      | readonly string[]
      | undefined;
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
        selectedResourceKeys: browserVisualPreparationResourceKeys,
        token,
      });
      return Object.freeze({
        activeEditorPins: entry.activeEditorPins,
        releasedCandidateResourceKeys: Object.freeze([]),
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

  private releaseUnpresentedCandidateResourceEntries(
    frameId: number,
    entry: GpuFlowVisibleFrameCandidateResourceEntry,
    presentedResourceKeys: ReadonlySet<string>,
  ): readonly string[] {
    const releasedResourceKeys: string[] = [];
    for (const resourceKey of entry.candidateResourceKeys) {
      if (presentedResourceKeys.has(resourceKey)) {
        continue;
      }
      releasedResourceKeys.push(resourceKey);
      this.retireVisibleFrameResource({
        ownerFrameId: frameId,
        resourceKey,
      });
    }
    return Object.freeze(releasedResourceKeys);
  }

  private releaseLoserCandidateResourceEntries(
    committedFrameId: number,
    retainedResourceKeys: ReadonlySet<string>,
  ): readonly string[] {
    const releasedResourceKeys: string[] = [];
    for (const [frameId, entry] of this.pendingCandidateByFrameId) {
      if (frameId === committedFrameId) {
        continue;
      }
      for (const resourceKey of entry.candidateResourceKeys) {
        if (retainedResourceKeys.has(resourceKey)) {
          continue;
        }
        releasedResourceKeys.push(resourceKey);
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
    const currentState = this.resourceStateByKey.get(
      request.resourceKey,
    )?.state;
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

  private createVisibleFrameResourceWorkResult(
    transitions: readonly GpuFlowVisibleFrameResourceWorkTransition[],
  ): GpuFlowVisibleFrameResourceWorkResult {
    return Object.freeze({
      remainingQueuedResourceKeys: Object.freeze([...this.queuedResourceKeys]),
      transitions: Object.freeze([...transitions]),
    });
  }

  private getPresentableCandidateResourceKeys(
    entry: GpuFlowVisibleFrameCandidateResourceEntry,
  ): readonly string[] {
    return Object.freeze(
      entry.candidateResourceKeys.filter((resourceKey) =>
        isGpuFlowVisibleFramePresentableResourceState(
          this.resourceStateByKey.get(resourceKey)?.state,
        ),
      ),
    );
  }

  private assertPreparedCandidateRequiredResourcesReady(
    entry: GpuFlowVisibleFrameCandidateResourceEntry,
  ): void {
    const unpreparedResource = entry.requiredResourceKeys.find(
      (resourceKey) => {
        const state = this.resourceStateByKey.get(resourceKey)?.state;
        return !isGpuFlowVisibleFramePresentableResourceState(state);
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

  private transitionResource(
    input: GpuFlowVisibleFrameResourceTransitionInput,
  ): void {
    const current = this.resourceStateByKey.get(input.resourceKey);
    assertGpuFlowVisibleFrameResourceTransition({
      currentState: current?.state ?? "absent",
      nextState: input.state,
      resourceKey: input.resourceKey,
    });
    this.transitionFrame += 1;
    this.resourceStateByKey.set(
      input.resourceKey,
      createGpuFlowVisibleFrameResourceStateEntry({
        current,
        input,
        transitionFrame: this.transitionFrame,
      }),
    );
  }
}

function isGpuFlowVisibleFramePresentableResourceState(
  state: GpuFlowVisibleFrameResourceStateKind | undefined,
): state is "presented" | "ready" {
  return state === "ready" || state === "presented";
}

function createGpuFlowVisibleFrameResourceStateEntry({
  current,
  input,
  transitionFrame,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly input: GpuFlowVisibleFrameResourceTransitionInput;
  readonly transitionFrame: number;
}): GpuFlowVisibleFrameResourceStateEntry {
  const requestedAtFrame = resolveGpuFlowVisibleFrameResourceRequestedAtFrame({
    current,
    state: input.state,
    transitionFrame,
  });
  const preparationLane = resolveGpuFlowVisibleFrameResourcePreparationLane({
    current,
    preparationLane: input.preparationLane,
    resourceKey: input.resourceKey,
  });
  const priority = resolveGpuFlowVisibleFrameResourcePriority({
    current,
    priority: input.priority,
    resourceKey: input.resourceKey,
  });
  return Object.freeze({
    debtAgeFrames: calculateGpuFlowVisibleFrameResourceDebtAgeFrames({
      requestedAtFrame,
      state: input.state,
      transitionFrame,
    }),
    deadlineFrame: resolveGpuFlowVisibleFrameResourceDeadlineFrame({
      current,
      deadlineFrame: input.deadlineFrame,
      priority,
      transitionFrame,
    }),
    estimatedCostMs: resolveGpuFlowVisibleFrameResourceEstimatedCostMs({
      current,
      estimatedCostMs: input.estimatedCostMs,
      resourceKey: input.resourceKey,
    }),
    ownerFrameId: input.ownerFrameId,
    preparationLane,
    priority,
    requestedAtFrame,
    resourceKey: input.resourceKey,
    state: input.state,
    transitionFrame,
  });
}

function resolveGpuFlowVisibleFrameResourceRequestedAtFrame({
  current,
  state,
  transitionFrame,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
  readonly transitionFrame: number;
}): number {
  if (state === "requested") {
    return transitionFrame;
  }
  return current?.requestedAtFrame ?? transitionFrame;
}

function resolveGpuFlowVisibleFrameResourcePreparationLane({
  current,
  preparationLane,
  resourceKey,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly preparationLane?:
    | GpuFlowVisibleFrameResourcePreparationLane
    | undefined;
  readonly resourceKey: string;
}): GpuFlowVisibleFrameResourcePreparationLane {
  return (
    preparationLane ??
    current?.preparationLane ??
    inferGpuFlowVisibleFrameResourcePreparationLane(resourceKey)
  );
}

function resolveGpuFlowVisibleFrameResourcePriority({
  current,
  priority,
  resourceKey,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly priority?: GpuFlowVisibleFrameResourcePriority | undefined;
  readonly resourceKey: string;
}): GpuFlowVisibleFrameResourcePriority {
  return (
    priority ??
    current?.priority ??
    inferGpuFlowVisibleFrameResourcePriority(resourceKey)
  );
}

function resolveGpuFlowVisibleFrameResourceDeadlineFrame({
  current,
  deadlineFrame,
  priority,
  transitionFrame,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly deadlineFrame?: number | null | undefined;
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly transitionFrame: number;
}): number | null {
  if (deadlineFrame !== undefined) {
    return deadlineFrame;
  }
  return (
    current?.deadlineFrame ??
    createGpuFlowVisibleFrameResourceDeadlineFrame({
      priority,
      transitionFrame,
    })
  );
}

function resolveGpuFlowVisibleFrameResourceEstimatedCostMs({
  current,
  estimatedCostMs,
  resourceKey,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly estimatedCostMs?: number | undefined;
  readonly resourceKey: string;
}): number {
  return (
    estimatedCostMs ??
    current?.estimatedCostMs ??
    estimateGpuFlowVisibleFrameResourceCostMs(resourceKey)
  );
}

function calculateGpuFlowVisibleFrameResourceDebtAgeFrames({
  requestedAtFrame,
  state,
  transitionFrame,
}: {
  readonly requestedAtFrame: number;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
  readonly transitionFrame: number;
}): number {
  if (state !== "requested" && state !== "preparing") {
    return 0;
  }
  return transitionFrame - requestedAtFrame;
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
  if (
    (
      allowedNextStates as readonly GpuFlowVisibleFrameResourceStateKind[]
    ).includes(nextState)
  ) {
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
