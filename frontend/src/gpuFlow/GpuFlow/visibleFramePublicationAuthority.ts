import {
  assertGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";

const GPU_FLOW_COMMIT_PUBLICATION_TOKEN = Symbol(
  "GpuFlowCommitPublicationToken",
);
const GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN = Symbol(
  "GpuFlowCommittedSurfaceResetToken",
);
const GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN = Symbol(
  "GpuFlowCommittedSurfaceStartupToken",
);
const GPU_FLOW_PRESENTABLE_COMMIT = Symbol("GpuFlowPresentableCommit");
const GPU_FLOW_HOLD_PREVIOUS_TOKEN = Symbol("GpuFlowHoldPreviousToken");
const GPU_FLOW_BLOCKED_PUBLICATION_TOKEN = Symbol(
  "GpuFlowBlockedPublicationToken",
);

export type GpuFlowVisibleTransactionId = string;
export type GpuFlowCommittedVisibleFrameId = number;
export type GpuFlowProjectionSampleId = number;
export type GpuFlowActorManifestDigest = string;
export type GpuFlowVisibleProofDigest = string;
export type GpuFlowPresentationPairDigest = string;
export const GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID =
  "cold-start-shell:browser-visual";
export const GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID =
  "cold-start-shell:retained-projection";

export type GpuFlowColdStartShellFrameId =
  | typeof GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID
  | typeof GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID;

export type GpuFlowColdStartShellFrame = {
  readonly id: GpuFlowColdStartShellFrameId;
  readonly input: "disabled";
  readonly kind: "cold-start-shell";
  readonly reason: string;
};

export type GpuFlowBlockedFrozenFrame =
  | {
      readonly frameId: GpuFlowCommittedVisibleFrameId;
      readonly kind: "committed";
    }
  | {
      readonly frame: GpuFlowColdStartShellFrame;
      readonly frameId: GpuFlowColdStartShellFrameId;
      readonly kind: "cold-start-shell";
    };

type CommitPublicationTokenBrand = {
  readonly [GPU_FLOW_COMMIT_PUBLICATION_TOKEN]: true;
};

type CommittedSurfaceResetTokenBrand = {
  readonly [GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN]: true;
};

type CommittedSurfaceStartupTokenBrand = {
  readonly [GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN]: true;
};

type PresentableCommitBrand = {
  readonly [GPU_FLOW_PRESENTABLE_COMMIT]: true;
};

type HoldPreviousTokenBrand = {
  readonly [GPU_FLOW_HOLD_PREVIOUS_TOKEN]: true;
};

type BlockedPublicationTokenBrand = {
  readonly [GPU_FLOW_BLOCKED_PUBLICATION_TOKEN]: true;
};

export type GpuFlowCommitPublicationToken = CommitPublicationTokenBrand & {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

export type GpuFlowCommittedSurfaceResetToken =
  CommittedSurfaceResetTokenBrand & {
    readonly transactionId: GpuFlowVisibleTransactionId;
  };

export type GpuFlowCommittedSurfaceStartupToken =
  CommittedSurfaceStartupTokenBrand & {
    readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
    readonly proofDigest: GpuFlowVisibleProofDigest;
    readonly startupFrameId: GpuFlowCommittedVisibleFrameId;
    readonly transactionId: GpuFlowVisibleTransactionId;
  };

export type GpuFlowPresentableCommit = PresentableCommitBrand & {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

export type GpuFlowHoldPreviousToken = HoldPreviousTokenBrand & {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

export type GpuFlowBlockedVisibleReason = {
  readonly actorId: string | null;
  readonly family: string;
  readonly reason: string;
};

export type GpuFlowBlockedPublicationToken = BlockedPublicationTokenBrand & {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrame: GpuFlowBlockedFrozenFrame;
  readonly frozenFrameId:
    | GpuFlowCommittedVisibleFrameId
    | GpuFlowColdStartShellFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

export function createGpuFlowCommittedSurfaceResetToken(): GpuFlowCommittedSurfaceResetToken {
  return Object.freeze({
    [GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN]: true as const,
    transactionId: "semantic-reset:committed-surface",
  });
}

export function createGpuFlowCommittedSurfaceStartupToken({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): GpuFlowCommittedSurfaceStartupToken {
  return Object.freeze({
    [GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN]: true as const,
    expectedActorSetDigest: createGpuFlowActorManifestDigest(frame),
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    startupFrameId: frame.displayFrameId,
    transactionId: `semantic-startup:frame-${frame.displayFrameId}`,
  });
}

export function createGpuFlowPresentableCommit({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowPresentableCommit {
  assertGpuFlowPresentableCommitFrame({ frame });
  return Object.freeze({
    [GPU_FLOW_PRESENTABLE_COMMIT]: true as const,
    committedFrameId: frame.displayFrameId,
    expectedActorSetDigest: createGpuFlowActorManifestDigest(frame),
    presentationPairDigest: createGpuFlowPresentationPairDigest({
      frame,
      projectionSampleId: projectionSample.id,
    }),
    projectionSampleId: projectionSample.id,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    transactionId: createGpuFlowVisibleTransactionId({
      frame,
      projectionSample,
    }),
  });
}

function assertGpuFlowPresentableCommitFrame({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): void {
  if (
    frame.publishability.kind !== "publishable" ||
    frame.publishability.blockingActorIds.length > 0
  ) {
    throw new Error(
      "GPU Flow commit publication authority requires a publishable committed surface frame.",
    );
  }
  assertGpuFlowPresentationPairFeasible({ frame });
}

function assertGpuFlowPresentationPairFeasible({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): void {
  assertGpuFlowCommittedSurfacePresentationProof(frame);
}

export function createGpuFlowCommitPublicationToken({
  presentableCommit,
}: {
  readonly presentableCommit: GpuFlowPresentableCommit;
}): GpuFlowCommitPublicationToken {
  assertGpuFlowPresentableCommit({ presentableCommit });
  return Object.freeze({
    [GPU_FLOW_COMMIT_PUBLICATION_TOKEN]: true as const,
    committedFrameId: presentableCommit.committedFrameId,
    expectedActorSetDigest: presentableCommit.expectedActorSetDigest,
    presentationPairDigest: presentableCommit.presentationPairDigest,
    projectionSampleId: presentableCommit.projectionSampleId,
    proofDigest: presentableCommit.proofDigest,
    transactionId: presentableCommit.transactionId,
  });
}

export function createGpuFlowHoldPreviousToken({
  committedFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  return Object.freeze({
    [GPU_FLOW_HOLD_PREVIOUS_TOKEN]: true as const,
    committedFrameId,
    holdAgeFrames,
    holdAgeMs,
    projectionSampleId: projectionSample.id,
    transactionId: `hold:frame-${committedFrameId}:sample-${projectionSample.id}`,
  });
}

export function createGpuFlowBlockedPublicationToken({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId:
    | GpuFlowCommittedVisibleFrameId
    | GpuFlowColdStartShellFrameId;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPublicationToken {
  const frozenFrame = createGpuFlowBlockedFrozenFrame(frozenFrameId);
  return Object.freeze({
    [GPU_FLOW_BLOCKED_PUBLICATION_TOKEN]: true as const,
    blockedReasons: Object.freeze(
      blockedReasons.map((reason) => Object.freeze({ ...reason })),
    ),
    frozenFrame,
    frozenFrameId,
    projectionSampleId: projectionSample.id,
    transactionId: `blocked:frame-${frozenFrameId}:sample-${projectionSample.id}`,
  });
}

function createGpuFlowBlockedFrozenFrame(
  frozenFrameId: GpuFlowCommittedVisibleFrameId | GpuFlowColdStartShellFrameId,
): GpuFlowBlockedFrozenFrame {
  if (typeof frozenFrameId === "number") {
    return Object.freeze({
      frameId: frozenFrameId,
      kind: "committed" as const,
    });
  }
  return Object.freeze({
    frame: Object.freeze({
      id: frozenFrameId,
      input: "disabled" as const,
      kind: "cold-start-shell" as const,
      reason: createGpuFlowColdStartShellReason(frozenFrameId),
    }),
    frameId: frozenFrameId,
    kind: "cold-start-shell" as const,
  });
}

function createGpuFlowColdStartShellReason(
  frameId: GpuFlowColdStartShellFrameId,
): string {
  switch (frameId) {
    case GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID:
      return "browser-visual-publication-blocked-before-first-commit";
    case GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID:
      return "retained-projection-blocked-before-first-commit";
  }
}

export function assertGpuFlowCommitPublicationToken({
  frame,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_COMMIT_PUBLICATION_TOKEN] !== true ||
    token.committedFrameId !== frame.displayFrameId ||
    token.expectedActorSetDigest !== createGpuFlowActorManifestDigest(frame) ||
    token.proofDigest !== createGpuFlowVisibleProofDigest(frame) ||
    token.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({
        frame,
        projectionSampleId: token.projectionSampleId,
      })
  ) {
    throw new Error(
      "GPU Flow committed content publication requires a commit publication token for the same visible frame.",
    );
  }
}

export function assertGpuFlowCommittedSurfaceResetToken({
  token,
}: {
  readonly token: GpuFlowCommittedSurfaceResetToken;
}): void {
  if (!isGpuFlowCommittedSurfaceResetToken(token)) {
    throw new Error(
      "GPU Flow committed surface reset requires a committed-surface reset publication token.",
    );
  }
}

export function assertGpuFlowCommittedSurfaceStartupToken({
  frame,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly token: GpuFlowCommittedSurfaceStartupToken;
}): void {
  if (
    !isGpuFlowCommittedSurfaceStartupToken(token) ||
    token.startupFrameId !== frame.displayFrameId ||
    token.expectedActorSetDigest !== createGpuFlowActorManifestDigest(frame) ||
    token.proofDigest !== createGpuFlowVisibleProofDigest(frame)
  ) {
    throw new Error(
      "GPU Flow committed surface startup publication requires a startup token for the same startup frame.",
    );
  }
}

export function assertGpuFlowCommitPublicationTokenForFrameId({
  committedFrameId,
  token,
}: {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_COMMIT_PUBLICATION_TOKEN] !== true ||
    token.committedFrameId !== committedFrameId
  ) {
    throw new Error(
      `GPU Flow browser visual publication requires a commit publication token for the same visible frame (expected frame ${committedFrameId}, received ${
        isGpuFlowCommitPublicationToken(token)
          ? token.committedFrameId
          : "unbranded"
      }).`,
    );
  }
}

export function assertGpuFlowCommitPublicationTokenForProjectionSample({
  projectionSampleId,
  token,
}: {
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (
    !isGpuFlowCommitPublicationToken(token) ||
    token.projectionSampleId !== projectionSampleId
  ) {
    throw new Error(
      `GPU Flow visible publication debt completion requires a commit token for the selected projection sample (expected sample ${projectionSampleId}, received sample ${
        isGpuFlowCommitPublicationToken(token)
          ? token.projectionSampleId
          : "unbranded"
      }).`,
    );
  }
}

export function assertGpuFlowHoldPreviousTokenForProjectionSample({
  projectionSampleId,
  token,
}: {
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly token: GpuFlowHoldPreviousToken;
}): void {
  if (
    !isGpuFlowHoldPreviousToken(token) ||
    token.projectionSampleId !== projectionSampleId
  ) {
    throw new Error(
      "GPU Flow visible publication debt completion requires a hold-previous token for the selected projection sample.",
    );
  }
}

export function assertGpuFlowBlockedPublicationTokenForProjectionSample({
  projectionSampleId,
  token,
}: {
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly token: GpuFlowBlockedPublicationToken;
}): void {
  if (
    !isGpuFlowBlockedPublicationToken(token) ||
    token.projectionSampleId !== projectionSampleId
  ) {
    throw new Error(
      "GPU Flow visible publication debt completion requires a blocked token for the selected projection sample.",
    );
  }
}

export function assertGpuFlowPreparedCandidateAbortToken({
  token,
}: {
  readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
}): void {
  if (
    !isGpuFlowBlockedPublicationToken(token) &&
    !isGpuFlowHoldPreviousToken(token)
  ) {
    throw new Error(
      "GPU Flow prepared browser visual abort requires a hold-previous or blocked publication token.",
    );
  }
}

export function assertGpuFlowCommitPublicationTokenBrand({
  token,
}: {
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (!isGpuFlowCommitPublicationToken(token)) {
    throw new Error(
      "GPU Flow commit-only publication resource release requires a commit publication token.",
    );
  }
}

export function assertGpuFlowBlockedPublicationTokenBrand({
  token,
}: {
  readonly token: GpuFlowBlockedPublicationToken;
}): void {
  if (!isGpuFlowBlockedPublicationToken(token)) {
    throw new Error(
      "GPU Flow rejected candidate resource release requires a blocked publication token.",
    );
  }
}

export function assertGpuFlowHoldPreviousTokenBrand({
  token,
}: {
  readonly token: GpuFlowHoldPreviousToken;
}): void {
  if (!isGpuFlowHoldPreviousToken(token)) {
    throw new Error(
      "GPU Flow held-previous visible publication requires a hold-previous publication token.",
    );
  }
}

function assertGpuFlowPresentableCommit({
  presentableCommit,
}: {
  readonly presentableCommit: GpuFlowPresentableCommit;
}): void {
  if (!isGpuFlowPresentableCommit(presentableCommit)) {
    throw new Error(
      "GPU Flow commit publication token minting requires a presentable commit proof.",
    );
  }
}

function isGpuFlowPresentableCommit(
  presentableCommit: unknown,
): presentableCommit is GpuFlowPresentableCommit {
  return Boolean(
    presentableCommit &&
      typeof presentableCommit === "object" &&
      (
        presentableCommit as {
          readonly [GPU_FLOW_PRESENTABLE_COMMIT]?: true;
        }
      )[GPU_FLOW_PRESENTABLE_COMMIT] === true,
  );
}

function isGpuFlowCommittedSurfaceResetToken(
  token: unknown,
): token is GpuFlowCommittedSurfaceResetToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN]?: true;
        }
      )[GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN] === true,
  );
}

function isGpuFlowCommittedSurfaceStartupToken(
  token: unknown,
): token is GpuFlowCommittedSurfaceStartupToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN]?: true;
        }
      )[GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN] === true,
  );
}

function isGpuFlowCommitPublicationToken(
  token: unknown,
): token is GpuFlowCommitPublicationToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_COMMIT_PUBLICATION_TOKEN]?: true;
        }
      )[GPU_FLOW_COMMIT_PUBLICATION_TOKEN] === true,
  );
}

function isGpuFlowHoldPreviousToken(
  token: unknown,
): token is GpuFlowHoldPreviousToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_HOLD_PREVIOUS_TOKEN]?: true;
        }
      )[GPU_FLOW_HOLD_PREVIOUS_TOKEN] === true,
  );
}

function isGpuFlowBlockedPublicationToken(
  token: unknown,
): token is GpuFlowBlockedPublicationToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_BLOCKED_PUBLICATION_TOKEN]?: true;
        }
      )[GPU_FLOW_BLOCKED_PUBLICATION_TOKEN] === true,
  );
}

function createGpuFlowVisibleTransactionId({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleTransactionId {
  return `commit:frame-${frame.displayFrameId}:sample-${projectionSample.id}`;
}

function createGpuFlowActorManifestDigest(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowActorManifestDigest {
  return JSON.stringify(
    frame.actorGenerations.map((actor) => [
      actor.actorId,
      actor.canonicalActorId,
      actor.actorFamily,
      actor.ownerSurfaceId,
      actor.generationClassification,
      actor.generationId,
      actor.contentGenerationId,
      actor.layoutProjectionGenerationId,
      actor.browserVisual?.coverageState ?? null,
      actor.browserVisual?.proof ?? null,
      actor.textCoverageProof ?? null,
    ]),
  );
}

function createGpuFlowVisibleProofDigest(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowVisibleProofDigest {
  const transaction = frame.surfaceTransaction;
  return JSON.stringify({
    blockingActorIds: frame.publishability.blockingActorIds,
    browserVisualCoverage: frame.projectionHorizon.textActorCoverage,
    kind: frame.publishability.kind,
    protectedResourceHandles: transaction?.protectedResourceHandles ?? [],
    surfaceCoverage: transaction
      ? {
          compatible: transaction.coverageProof.compatibleCoverage.length,
          exact: transaction.coverageProof.exactCoverage.length,
          trueHoles: transaction.coverageProof.trueHoleRects.length,
        }
      : null,
  });
}

function createGpuFlowPresentationPairDigest({
  frame,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowPresentationPairDigest {
  return JSON.stringify({
    actorManifestDigest: createGpuFlowActorManifestDigest(frame),
    browserVisualFragmentDigest:
      frame.presentationProof.browserVisualFragmentDigest,
    canvasGeneration: frame.presentationProof.canvasGeneration,
    domGeneration: frame.presentationProof.domGeneration,
    presentationBatchId: frame.presentationProof.batchId,
    presentationProofDigest: createGpuFlowPresentationProofDigest(frame),
    projectionSampleId,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    proofPresentationActorManifestDigest:
      frame.presentationProof.actorManifestDigest,
    surfaceTransactionDigest: frame.presentationProof.surfaceTransactionDigest,
  });
}

function createGpuFlowPresentationProofDigest(
  frame: GpuFlowCommittedSurfaceFrame,
): string {
  return JSON.stringify({
    actorManifestDigest: frame.presentationProof.actorManifestDigest,
    browserVisualFragmentDigest:
      frame.presentationProof.browserVisualFragmentDigest,
    canvasGeneration: frame.presentationProof.canvasGeneration,
    domGeneration: frame.presentationProof.domGeneration,
    presentationBatchId: frame.presentationProof.batchId,
    surfaceTransactionDigest: frame.presentationProof.surfaceTransactionDigest,
  });
}
