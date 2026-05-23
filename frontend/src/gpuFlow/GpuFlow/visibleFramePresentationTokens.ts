import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  assertGpuFlowCommitPresentationPairProof,
  assertGpuFlowPresentableCommitFrame,
  createGpuFlowActorManifestDigest,
  createGpuFlowCommitResourceProtectionDigestForFrame,
  createGpuFlowPresentationPairDigest,
  createGpuFlowVisibleProofDigest,
  type GpuFlowCommitAuthorityProof,
  type GpuFlowCommitPresentationPairProof,
} from "./visibleFrameCommitProofs";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  type GpuFlowColdStartShellFrame,
  type GpuFlowColdStartShellFrameId,
  type GpuFlowVisibleFramePresentationIdentity,
} from "./visibleFrameTypes";

const GPU_FLOW_COMMIT_PUBLICATION_TOKEN = Symbol(
  "GpuFlowCommitPublicationToken",
);
const GPU_FLOW_PRESENTABLE_COMMIT = Symbol(
  "GpuFlowVisibleFramePresentableCommit",
);
const GPU_FLOW_HOLD_PREVIOUS_TOKEN = Symbol("GpuFlowHoldPreviousToken");
const GPU_FLOW_BLOCKED_PUBLICATION_TOKEN = Symbol(
  "GpuFlowBlockedPublicationToken",
);

type GpuFlowVisibleTransactionId = string;
type GpuFlowCommittedVisibleFrameId = number;
type GpuFlowProjectionSampleId = number;
type GpuFlowActorManifestDigest = string;
type GpuFlowVisibleProofDigest = string;
type GpuFlowPresentationPairDigest = string;
type GpuFlowResourceProtectionDigest = string;

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
  readonly contentFrameId: GpuFlowVisibleFramePresentationIdentity["contentFrameId"];
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationId: GpuFlowVisibleFramePresentationIdentity["presentationId"];
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

type GpuFlowPresentableCommit = PresentableCommitBrand & {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly contentFrameId: GpuFlowVisibleFramePresentationIdentity["contentFrameId"];
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationId: GpuFlowVisibleFramePresentationIdentity["presentationId"];
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
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

type GpuFlowVisiblePublicationTokenIssuer = {
  readonly createBlockedPublicationToken: (input: {
    readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
    readonly frozenFrameId:
      | GpuFlowCommittedVisibleFrameId
      | GpuFlowColdStartShellFrameId;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowBlockedPublicationToken;
  readonly createCommitPublicationToken: (input: {
    readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
    readonly frame: GpuFlowCommittedSurfaceFrame;
    readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowCommitPublicationToken;
  readonly createHoldPreviousToken: (input: {
    readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
    readonly holdAgeFrames: number;
    readonly holdAgeMs: number;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowHoldPreviousToken;
};

function createGpuFlowVisiblePublicationTokenIssuer(): GpuFlowVisiblePublicationTokenIssuer {
  return Object.freeze({
    createBlockedPublicationToken: createGpuFlowBlockedPublicationToken,
    createCommitPublicationToken: ({
      commitAuthorityProof,
      frame,
      presentationIdentity,
      projectionSample,
    }) =>
      createGpuFlowCommitPublicationToken({
        presentableCommit: createGpuFlowPresentableCommit({
          commitAuthorityProof,
          frame,
          presentationIdentity,
          projectionSample,
        }),
      }),
    createHoldPreviousToken: createGpuFlowHoldPreviousToken,
  });
}

const visiblePublicationTokenIssuer =
  createGpuFlowVisiblePublicationTokenIssuer();

function createGpuFlowPresentableCommit({
  frame,
  commitAuthorityProof,
  presentationIdentity,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowPresentableCommit {
  assertGpuFlowPresentableCommitFrame({
    frame,
    commitAuthorityProof,
    projectionSampleId: projectionSample.id,
  });
  assertGpuFlowCommitPresentationIdentity({
    frame,
    presentationIdentity,
    projectionSample,
  });
  return Object.freeze({
    [GPU_FLOW_PRESENTABLE_COMMIT]: true as const,
    committedFrameId: frame.displayFrameId,
    contentFrameId: presentationIdentity.contentFrameId,
    expectedActorSetDigest: commitAuthorityProof.expectedActorSetDigest,
    presentationId: presentationIdentity.presentationId,
    presentationPairDigest: commitAuthorityProof.presentationPairDigest,
    presentationPairProof: commitAuthorityProof.presentationPairProof,
    projectionSampleId: projectionSample.id,
    proofDigest: commitAuthorityProof.proofDigest,
    resourceProtectionDigest: commitAuthorityProof.resourceProtectionDigest,
    transactionId: createGpuFlowVisibleTransactionId({
      frame,
      projectionSample,
    }),
  });
}

export function createGpuFlowVisibleFrameHoldPreviousToken({
  committedFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly committedFrameId: number;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  return visiblePublicationTokenIssuer.createHoldPreviousToken({
    committedFrameId,
    holdAgeFrames,
    holdAgeMs,
    projectionSample,
  });
}

export function createGpuFlowVisibleFrameBlockedPublicationToken({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPublicationToken {
  return visiblePublicationTokenIssuer.createBlockedPublicationToken({
    blockedReasons,
    frozenFrameId,
    projectionSample,
  });
}

export function createGpuFlowVisiblePublicationCompletionCommitToken({
  commitAuthorityProof,
  publicationDecision,
  presentationIdentity,
  visibleProjectionState,
}: {
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly publicationDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowCommitPublicationToken {
  if (visibleProjectionState.sample.id !== publicationDecision.sample.id) {
    throw new Error(
      "GPU Flow committed publication completion requires visible projection state for the selected sample.",
    );
  }
  if (
    commitAuthorityProof.expectedActorSetDigest !==
      visibleProjectionState.committedFrame.presentationProof
        .actorManifestDigest ||
    commitAuthorityProof.presentationPairProof.projectionSampleId !==
      publicationDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow committed publication completion requires a commit authority proof for the selected visible frame and projection sample.",
    );
  }
  return visiblePublicationTokenIssuer.createCommitPublicationToken({
    commitAuthorityProof,
    frame: visibleProjectionState.committedFrame,
    presentationIdentity,
    projectionSample: publicationDecision.sample,
  });
}

function createGpuFlowCommitPublicationToken({
  presentableCommit,
}: {
  readonly presentableCommit: GpuFlowPresentableCommit;
}): GpuFlowCommitPublicationToken {
  assertGpuFlowPresentableCommit({ presentableCommit });
  return Object.freeze({
    [GPU_FLOW_COMMIT_PUBLICATION_TOKEN]: true as const,
    committedFrameId: presentableCommit.committedFrameId,
    contentFrameId: presentableCommit.contentFrameId,
    expectedActorSetDigest: presentableCommit.expectedActorSetDigest,
    presentationId: presentableCommit.presentationId,
    presentationPairDigest: presentableCommit.presentationPairDigest,
    presentationPairProof: presentableCommit.presentationPairProof,
    projectionSampleId: presentableCommit.projectionSampleId,
    proofDigest: presentableCommit.proofDigest,
    resourceProtectionDigest: presentableCommit.resourceProtectionDigest,
    transactionId: presentableCommit.transactionId,
  });
}

function assertGpuFlowCommitPresentationIdentity({
  frame,
  presentationIdentity,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): void {
  if (
    String(presentationIdentity.contentFrameId) !==
      String(frame.displayFrameId) ||
    presentationIdentity.projectionSampleId !== projectionSample.id
  ) {
    throw new Error(
      "GPU Flow commit publication token requires the visible frame engine identity for the selected content frame and projection sample.",
    );
  }
}

function createGpuFlowHoldPreviousToken({
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

function createGpuFlowBlockedPublicationToken({
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
    token.resourceProtectionDigest !==
      createGpuFlowCommitResourceProtectionDigestForFrame({ frame }) ||
    !token.presentationPairProof ||
    token.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({
        frame,
        presentationPairProof: token.presentationPairProof,
        projectionSampleId: token.projectionSampleId,
      })
  ) {
    throw new Error(
      "GPU Flow committed content publication requires a commit publication token for the same visible frame.",
    );
  }
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof: token.presentationPairProof,
    projectionSampleId: token.projectionSampleId,
    projectionTransactionId:
      token.presentationPairProof.canvasGenerationEvidence
        .projectionTransactionId,
  });
}

export function assertGpuFlowCommitPublicationTokenForPresentationProof({
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
    token.expectedActorSetDigest !==
      frame.presentationProof.actorManifestDigest ||
    token.proofDigest !== createGpuFlowVisibleProofDigest(frame) ||
    !token.presentationPairProof ||
    token.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({
        frame,
        presentationPairProof: token.presentationPairProof,
        projectionSampleId: token.projectionSampleId,
      })
  ) {
    throw new Error(
      "GPU Flow committed content publication requires a commit publication token for the same visible frame.",
    );
  }
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof: token.presentationPairProof,
    projectionSampleId: token.projectionSampleId,
    projectionTransactionId:
      token.presentationPairProof.canvasGenerationEvidence
        .projectionTransactionId,
  });
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
