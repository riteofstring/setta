import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
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
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

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
      heldPreviousProjectionState?.committedFrame.displayFrameId ??
      GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  });
}

export function createGpuFlowBrowserVisualBlockedPublicationCandidate({
  frame,
  heldPreviousProjectionState,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate {
  return Object.freeze({
    blockedReasons: createGpuFlowBlockedVisibleReasons(frame),
    frozenFrameId: resolveGpuFlowBlockedVisibleFrozenFrameId({
      heldPreviousProjectionState,
    }),
  });
}

export function shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair(
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

export function createGpuFlowBrowserVisualResourceWorkRequests({
  blockedPublicationCandidate,
  frame,
}: {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): readonly GpuFlowBrowserVisualResourceWorkRequest[] {
  const actorById = new Map(
    frame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  return Object.freeze(
    blockedPublicationCandidate.blockedReasons.map((reason) =>
      createGpuFlowBrowserVisualResourceWorkRequest({
        actor: reason.actorId ? actorById.get(reason.actorId) : undefined,
        frame,
        reason,
      }),
    ),
  );
}

function createGpuFlowBlockedVisibleReasons(
  frame: GpuFlowCommittedSurfaceFrame,
): readonly GpuFlowBlockedVisibleReason[] {
  const actorById = new Map(
    frame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  const actorIds = getGpuFlowCommittedSurfacePublishabilityActorIds(frame);
  return Object.freeze(
    actorIds.map((actorId) => {
      const actor = actorById.get(actorId);
      return Object.freeze({
        actorId,
        family: actor?.actorFamily ?? actor?.kind ?? "unknown",
        reason: getGpuFlowBrowserVisualBlockedReason({
          frame,
          textCoverage: actor?.textCoverageProof,
        }),
      });
    }),
  );
}

function createGpuFlowBrowserVisualResourceWorkRequest({
  actor,
  frame,
  reason,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame;
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
  readonly frame: GpuFlowCommittedSurfaceFrame;
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
  return `browser-visual:${actor.actorId}:compatible-previous:${compatiblePreviousProof.previousCommittedFrameId}`;
}

function getGpuFlowBrowserVisualResourceGeneration({
  actor,
  frame,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame;
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
  readonly frame: GpuFlowCommittedSurfaceFrame;
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
  readonly frame: GpuFlowCommittedSurfaceFrame;
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

export function getGpuFlowCommittedSurfacePublishabilityActorIds(
  frame: GpuFlowCommittedSurfaceFrame,
): readonly string[] {
  return frame.publishability.kind === "true-hole"
    ? frame.publishability.actorIds
    : frame.publishability.blockingActorIds;
}

export function getGpuFlowBrowserVisualBlockedReason({
  frame,
  textCoverage,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly textCoverage: OptionalGpuFlowBrowserVisualTextCoverageProof;
}): string {
  if (textCoverage && "readinessReason" in textCoverage) {
    return textCoverage.readinessReason;
  }
  return getGpuFlowCommittedSurfacePublishabilityReason(frame);
}

function getGpuFlowCommittedSurfacePublishabilityReason(
  frame: GpuFlowCommittedSurfaceFrame,
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
    heldPreviousProjectionState?.committedFrame.displayFrameId ??
    GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID
  );
}
