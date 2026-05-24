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

type GpuFlowVisibleFrameResourceGraphSnapshot = {
  readonly activeEditorPins: readonly string[];
  readonly candidateResourceKeys: readonly string[];
  readonly committedFrameId: number | null;
  readonly committedResourceKeys: readonly string[];
  readonly pendingCandidateFrameIds: readonly number[];
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

type GpuFlowVisibleFrameResourceStateSnapshot = {
  readonly debtAgeFrames: number;
  readonly ownerFrameId: number | null;
  readonly resourceKey: string;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
};

type GpuFlowVisibleFrameResourceStateEntry =
  GpuFlowVisibleFrameResourceStateSnapshot & {
    readonly requestedAtFrame: number;
    readonly transitionFrame: number;
  };

export class GpuFlowVisibleFrameResourceGraph {
  private committedFrameId: number | null = null;
  private committedResourceKeys = new Set<string>();
  private readonly pendingCandidateByFrameId = new Map<
    number,
    GpuFlowVisibleFrameCandidateResourceEntry
  >();
  private readonly resourceStateByKey = new Map<
    string,
    GpuFlowVisibleFrameResourceStateEntry
  >();
  private transitionFrame = 0;

  requestVisibleFrameResource({
    ownerFrameId = null,
    resourceKey,
  }: {
    readonly ownerFrameId?: number | null | undefined;
    readonly resourceKey: string;
  }): void {
    this.transitionResource({
      ownerFrameId,
      resourceKey,
      state: "requested",
    });
  }

  markVisibleFrameResourcePreparing({
    ownerFrameId = null,
    resourceKey,
  }: {
    readonly ownerFrameId?: number | null | undefined;
    readonly resourceKey: string;
  }): void {
    this.transitionResource({
      ownerFrameId,
      resourceKey,
      state: "preparing",
    });
  }

  markVisibleFrameResourceReady({
    ownerFrameId = null,
    resourceKey,
  }: {
    readonly ownerFrameId?: number | null | undefined;
    readonly resourceKey: string;
  }): void {
    this.transitionResource({
      ownerFrameId,
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
    for (const resourceKey of entry.candidateResourceKeys) {
      this.prepareCandidateResource({
        ownerFrameId: frameId,
        resourceKey,
      });
    }
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
      resourceDebtByState: createGpuFlowVisibleFrameResourceDebtByStateSnapshot(
        this.resourceStateByKey,
      ),
      resourceStates: Object.freeze(
        [...this.resourceStateByKey.values()]
          .map((entry) =>
            Object.freeze({
              debtAgeFrames: entry.debtAgeFrames,
              ownerFrameId: entry.ownerFrameId,
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

  private prepareCandidateResource({
    ownerFrameId,
    resourceKey,
  }: {
    readonly ownerFrameId: number;
    readonly resourceKey: string;
  }): void {
    const currentState = this.resourceStateByKey.get(resourceKey)?.state;
    if (currentState === "presented" || currentState === "ready") {
      return;
    }
    this.requestVisibleFrameResource({ ownerFrameId, resourceKey });
    this.markVisibleFrameResourcePreparing({ ownerFrameId, resourceKey });
    this.markVisibleFrameResourceReady({ ownerFrameId, resourceKey });
  }

  private transitionResource({
    ownerFrameId,
    resourceKey,
    state,
  }: {
    readonly ownerFrameId: number | null;
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
    this.resourceStateByKey.set(
      resourceKey,
      Object.freeze({
        debtAgeFrames:
          state === "requested" || state === "preparing"
            ? this.transitionFrame - requestedAtFrame
            : 0,
        ownerFrameId,
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
