import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type {
  GpuFlowBrowserVisualResourceWorkRect,
  GpuFlowBrowserVisualResourceWorkRequest,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFrameContentPlan";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
} from "./visibleFramePresentationProofs";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
} from "./visibleFrameTypes";

type GpuFlowBrowserVisualActorGeneration =
  GpuFlowPreparedContentFrame["actorGenerations"][number];

type GpuFlowBrowserVisualTextCoverageProof = NonNullable<
  GpuFlowBrowserVisualActorGeneration["textCoverageProof"]
>;

type OptionalGpuFlowBrowserVisualTextCoverageProof =
  | GpuFlowBrowserVisualTextCoverageProof
  | null
  | undefined;

export function createGpuFlowRetainedProjectionBlockedPublicationCandidate({
  blockedReason,
  heldPreviousProjectionState,
}: {
  readonly blockedReason: string;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate {
  return Object.freeze({
    blockedReasons: Object.freeze([
      Object.freeze({
        actorId: null,
        family: "retained-projection",
        reason: blockedReason,
      }),
    ]),
    frozenFrameId:
      heldPreviousProjectionState?.preparedContentFrame.displayFrameId ??
      GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  });
}

export function createGpuFlowBrowserVisualBlockedPublicationCandidate({
  frame,
  heldPreviousProjectionState,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate {
  if (isGpuFlowRetainedSurfaceTrueHoleFrame(frame)) {
    return createGpuFlowRetainedSurfaceTrueHoleBlockedPublicationCandidate({
      frame,
      heldPreviousProjectionState,
    });
  }
  return Object.freeze({
    blockedReasons: createGpuFlowBlockedVisibleReasons(frame),
    frozenFrameId: resolveGpuFlowBlockedVisibleFrozenFrameId({
      heldPreviousProjectionState,
    }),
  });
}

function createGpuFlowRetainedSurfaceTrueHoleBlockedPublicationCandidate({
  frame,
  heldPreviousProjectionState,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate {
  return Object.freeze({
    blockedReasons: Object.freeze(
      getGpuFlowPreparedContentPublishabilityActorIds(frame).map((actorId) =>
        Object.freeze({
          actorId,
          family: "retained-projection",
          reason: "retained-surface-true-hole",
        }),
      ),
    ),
    frozenFrameId:
      heldPreviousProjectionState?.preparedContentFrame.displayFrameId ??
      GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  });
}

function isGpuFlowRetainedSurfaceTrueHoleFrame(
  frame: GpuFlowPreparedContentFrame,
): boolean {
  return (
    frame.publishability.kind === "true-hole" &&
    frame.publishability.reason === "retained-surface-true-hole"
  );
}

export function shouldPreservePreparedContentFrameForBrowserVisualRepair(
  candidate: GpuFlowVisibleFrameBlockedPublicationCandidate,
): boolean {
  return candidate.blockedReasons.some(
    (reason) =>
      reason.family === "dom-control" ||
      reason.family === "dom-island" ||
      reason.reason === "snapshot-pending" ||
      reason.reason === "live-dom-budget" ||
      reason.reason === "visible-dom-control-not-projected",
  );
}

export function createGpuFlowFrozenPreviousSafeBlockedReasons({
  blockedReasons,
  previousVisibleProjectionState,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): readonly GpuFlowBlockedVisibleReason[] {
  if (blockedReasons.length === 0) {
    return blockedReasons;
  }
  if (previousVisibleProjectionState === null) {
    return createGpuFlowColdStartSafeBlockedReasons({ blockedReasons });
  }
  const previousPassiveVisibleActorIds =
    createGpuFlowPassiveBrowserVisualActorIdSet(
      previousVisibleProjectionState.preparedContentFrame,
    );
  if (previousPassiveVisibleActorIds.size === 0) {
    return blockedReasons;
  }
  const { hiddenReasons, retainedReasons } =
    partitionGpuFlowFrozenPreviousBlockedReasons({
      blockedReasons,
      previousPassiveVisibleActorIds,
    });
  if (hiddenReasons.length === 0) {
    return blockedReasons;
  }
  if (retainedReasons.length > 0) {
    return Object.freeze(
      retainedReasons.map((reason) => freezeBlockedReason(reason)),
    );
  }
  return Object.freeze(
    [...new Set(hiddenReasons.map((reason) => reason.reason))].map((reason) =>
      Object.freeze({
        actorId: null,
        family: "browser-visual",
        reason,
      }),
    ),
  );
}

export function createGpuFlowColdStartSafeBlockedReasons({
  blockedReasons,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
}): readonly GpuFlowBlockedVisibleReason[] {
  if (
    !shouldCollapseGpuFlowColdStartBrowserVisualBlockedReasons(blockedReasons)
  ) {
    return blockedReasons;
  }
  return Object.freeze(
    [...new Set(blockedReasons.map((reason) => reason.reason))].map((reason) =>
      Object.freeze({
        actorId: null,
        family: "browser-visual",
        reason,
      }),
    ),
  );
}

export function resolveGpuFlowColdStartBlockedFrozenFrameId({
  blockedReasons,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
}): GpuFlowBlockedPublicationToken["frozenFrameId"] {
  return shouldCollapseGpuFlowColdStartBrowserVisualBlockedReasons(
    blockedReasons,
  )
    ? GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID
    : GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID;
}

function partitionGpuFlowFrozenPreviousBlockedReasons({
  blockedReasons,
  previousPassiveVisibleActorIds,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly previousPassiveVisibleActorIds: ReadonlySet<string>;
}): {
  readonly hiddenReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly retainedReasons: readonly GpuFlowBlockedVisibleReason[];
} {
  const retainedReasons: GpuFlowBlockedVisibleReason[] = [];
  const hiddenReasons: GpuFlowBlockedVisibleReason[] = [];
  for (const reason of blockedReasons) {
    if (
      isGpuFlowFrozenPreviousHiddenBlockedReason({
        previousPassiveVisibleActorIds,
        reason,
      })
    ) {
      hiddenReasons.push(reason);
    } else {
      retainedReasons.push(reason);
    }
  }
  return Object.freeze({
    hiddenReasons: Object.freeze(hiddenReasons),
    retainedReasons: Object.freeze(retainedReasons),
  });
}

function isGpuFlowFrozenPreviousHiddenBlockedReason({
  previousPassiveVisibleActorIds,
  reason,
}: {
  readonly previousPassiveVisibleActorIds: ReadonlySet<string>;
  readonly reason: GpuFlowBlockedVisibleReason;
}): boolean {
  return (
    reason.actorId !== null &&
    isGpuFlowBrowserVisualBlockedReasonFamily(reason.family) &&
    previousPassiveVisibleActorIds.has(reason.actorId)
  );
}

export function createGpuFlowBrowserVisualResourceWorkRequests({
  blockedPublicationCandidate,
  frame,
}: {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
  readonly frame: GpuFlowPreparedContentFrame;
}): readonly GpuFlowBrowserVisualResourceWorkRequest[] {
  const actorById = new Map(
    frame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  return Object.freeze(
    blockedPublicationCandidate.blockedReasons
      .filter((reason) =>
        isGpuFlowBrowserVisualBlockedReasonFamily(reason.family),
      )
      .map((reason) =>
        createGpuFlowBrowserVisualResourceWorkRequest({
          actor: reason.actorId ? actorById.get(reason.actorId) : undefined,
          frame,
          reason,
        }),
      ),
  );
}

function createGpuFlowBlockedVisibleReasons(
  frame: GpuFlowPreparedContentFrame,
): readonly GpuFlowBlockedVisibleReason[] {
  const actorById = new Map(
    frame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  const actorIds = getGpuFlowPreparedContentPublishabilityActorIds(frame);
  const publishabilityActorFamily =
    getGpuFlowPreparedContentPublishabilityActorFamily(frame);
  return Object.freeze(
    actorIds.map((actorId) => {
      const actor = actorById.get(actorId);
      return Object.freeze({
        actorId,
        family: actor?.actorFamily ?? actor?.kind ?? publishabilityActorFamily,
        reason: getGpuFlowBrowserVisualBlockedReason({
          frame,
          textCoverage: actor?.textCoverageProof,
        }),
      });
    }),
  );
}

function createGpuFlowPassiveBrowserVisualActorIdSet(
  frame: GpuFlowPreparedContentFrame,
): ReadonlySet<string> {
  return new Set(
    frame.actorGenerations
      .filter(isGpuFlowFrozenPreviousPassiveBrowserVisualActor)
      .map((actor) => actor.actorId),
  );
}

function isGpuFlowFrozenPreviousPassiveBrowserVisualActor(
  actor: GpuFlowBrowserVisualActorGeneration,
): boolean {
  return (
    !actor.active &&
    isGpuFlowBrowserVisualBlockedReasonFamily(actor.actorFamily) &&
    (actor.visibleNonempty || actor.kind === "dom-control")
  );
}

function isGpuFlowBrowserVisualBlockedReasonFamily(family: string): boolean {
  return (
    family === "browser-text-control" ||
    family === "browser-text-snapshot" ||
    family === "browser-visual" ||
    family === "dom-control" ||
    family === "text-like-dom-control"
  );
}

function shouldCollapseGpuFlowColdStartBrowserVisualBlockedReasons(
  blockedReasons: readonly GpuFlowBlockedVisibleReason[],
): boolean {
  return (
    blockedReasons.length > 0 &&
    blockedReasons.every((reason) =>
      isGpuFlowBrowserVisualBlockedReasonFamily(reason.family),
    )
  );
}

function freezeBlockedReason(
  reason: GpuFlowBlockedVisibleReason,
): GpuFlowBlockedVisibleReason {
  return Object.freeze({ ...reason });
}

function createGpuFlowBrowserVisualResourceWorkRequest({
  actor,
  frame,
  reason,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly frame: GpuFlowPreparedContentFrame;
  readonly reason: GpuFlowBlockedVisibleReason;
}): GpuFlowBrowserVisualResourceWorkRequest {
  const actorId = reason.actorId ?? null;
  const resourceKey = createGpuFlowBrowserVisualResourceKey({
    actor,
    actorId,
    frame,
    reason,
  });
  return Object.freeze({
    actorId,
    blockedReason: reason.reason,
    candidateResourceKey: resourceKey,
    clipRect: createGpuFlowBrowserVisualResourceWorkRect(actor?.clipRect),
    debtAgeFrames: 0,
    lastReadyResourceKey: getGpuFlowBrowserVisualLastReadyResourceKey(actor),
    ownerFrameId: frame.displayFrameId,
    readinessState: "requested" as const,
    representationKind: getGpuFlowBrowserVisualResourceRepresentationKind({
      actor,
      frame,
      reason,
    }),
    sourceHostIdentity: getGpuFlowBrowserVisualSourceHostIdentity({
      actor,
      actorId,
      frame,
      reason,
    }),
    sourceRect: createGpuFlowBrowserVisualResourceWorkRect(actor?.sourceRect),
    wakeupSource: "blocked-publication" as const,
  });
}

function createGpuFlowBrowserVisualResourceKey({
  actor,
  actorId,
  frame,
  reason,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly actorId: string | null;
  readonly frame: GpuFlowPreparedContentFrame;
  readonly reason: GpuFlowBlockedVisibleReason;
}): string {
  const generation = getGpuFlowBrowserVisualResourceGeneration({
    actor,
    frame,
  });
  return [
    "browser-visual",
    actorId ?? "frame",
    reason.family,
    reason.reason,
    generation,
  ].join(":");
}

function getGpuFlowBrowserVisualLastReadyResourceKey(
  actor: GpuFlowBrowserVisualActorGeneration | undefined,
): string | null {
  if (!actor) {
    return null;
  }
  const compatiblePreviousProof =
    actor.textCoverageProof?.projectionCoverage === "compatible-previous"
      ? actor.textCoverageProof.compatiblePreviousProof
      : null;
  if (compatiblePreviousProof === null) {
    return null;
  }
  return `browser-visual:${actor.actorId}:compatible-previous:${compatiblePreviousProof.previousContentFrameId}`;
}

function getGpuFlowBrowserVisualResourceGeneration({
  actor,
  frame,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly frame: GpuFlowPreparedContentFrame;
}): string {
  const textCoverage = actor?.textCoverageProof;
  return (
    readGpuFlowBrowserVisualStringProperty(
      textCoverage,
      "snapshotCacheKeyRevision",
    ) ??
    readGpuFlowBrowserVisualStringProperty(
      textCoverage,
      "visualGenerationId",
    ) ??
    actor?.generationId ??
    `frame-${frame.displayFrameId}`
  );
}

function getGpuFlowBrowserVisualResourceRepresentationKind({
  actor,
  frame,
  reason,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly frame: GpuFlowPreparedContentFrame;
  readonly reason: GpuFlowBlockedVisibleReason;
}): string {
  return (
    actor?.browserVisual?.representationKind ??
    actor?.textCoverageProof?.projectionCoverage ??
    reason.family ??
    frame.publishability.kind
  );
}

function getGpuFlowBrowserVisualSourceHostIdentity({
  actor,
  actorId,
  frame,
  reason,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly actorId: string | null;
  readonly frame: GpuFlowPreparedContentFrame;
  readonly reason: GpuFlowBlockedVisibleReason;
}): string {
  return (
    actor?.ownerSurfaceId ??
    actor?.canonicalActorId ??
    actor?.actorId ??
    actorId ??
    `${reason.family}:${frame.displayFrameId}`
  );
}

function createGpuFlowBrowserVisualResourceWorkRect(
  rect: unknown,
): GpuFlowBrowserVisualResourceWorkRect | null {
  if (typeof rect !== "object" || rect === null) {
    return null;
  }
  const candidate = rect as Partial<
    Record<"height" | "width" | "x" | "y", unknown>
  >;
  if (
    typeof candidate.height !== "number" ||
    typeof candidate.width !== "number" ||
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number"
  ) {
    return null;
  }
  return Object.freeze({
    height: candidate.height,
    width: candidate.width,
    x: candidate.x,
    y: candidate.y,
  });
}

function readGpuFlowBrowserVisualStringProperty(
  value: unknown,
  property: string,
): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" ? propertyValue : null;
}

export function getGpuFlowPreparedContentPublishabilityActorIds(
  frame: GpuFlowPreparedContentFrame,
): readonly string[] {
  return frame.publishability.kind === "true-hole"
    ? frame.publishability.actorIds
    : frame.publishability.blockingActorIds;
}

function getGpuFlowPreparedContentPublishabilityActorFamily(
  frame: GpuFlowPreparedContentFrame,
): string {
  return frame.publishability.kind === "true-hole"
    ? frame.publishability.actorFamily
    : "unknown";
}

export function getGpuFlowBrowserVisualBlockedReason({
  frame,
  textCoverage,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly textCoverage: OptionalGpuFlowBrowserVisualTextCoverageProof;
}): string {
  if (textCoverage && "readinessReason" in textCoverage) {
    return textCoverage.readinessReason;
  }
  return getGpuFlowPreparedContentPublishabilityReason(frame);
}

function getGpuFlowPreparedContentPublishabilityReason(
  frame: GpuFlowPreparedContentFrame,
): string {
  switch (frame.publishability.kind) {
    case "block-first-publication":
    case "hold-previous":
    case "true-hole":
      return frame.publishability.reason;
    case "publishable":
      return "browser-visual-coverage-missing";
  }
}

function resolveGpuFlowBlockedVisibleFrozenFrameId({
  heldPreviousProjectionState,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowBlockedPublicationToken["frozenFrameId"] {
  return (
    heldPreviousProjectionState?.preparedContentFrame.displayFrameId ??
    GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID
  );
}
