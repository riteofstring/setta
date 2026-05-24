import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  assertGpuFlowCommitPresentationPairProof,
  assertGpuFlowPresentationAuthorityFrame,
  createGpuFlowActorManifestDigest,
  createGpuFlowCommitResourceProtectionDigestForFrame,
  createGpuFlowPresentationPairDigest,
  createGpuFlowVisibleProofDigest,
  type GpuFlowCommitAuthorityProof,
  type GpuFlowCommitPresentationPairProof,
} from "./visibleFrameCommitProofs";
import {
  createGpuFlowColdStartShellFrame,
  type GpuFlowColdStartShellFrame,
  type GpuFlowColdStartShellFrameId,
  type GpuFlowVisibleFramePresentationIdentity,
} from "./visibleFrameTypes";

const GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN = Symbol(
  "GpuFlowVisibleFramePresentationToken",
);
const GPU_FLOW_PRESENTABLE_FRAME = Symbol(
  "GpuFlowVisibleFramePresentableFrame",
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

type VisibleFramePresentationTokenBrand = {
  readonly [GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN]: true;
};

type PresentableFrameBrand = {
  readonly [GPU_FLOW_PRESENTABLE_FRAME]: true;
};

type HoldPreviousTokenBrand = {
  readonly [GPU_FLOW_HOLD_PREVIOUS_TOKEN]: true;
};

type BlockedPublicationTokenBrand = {
  readonly [GPU_FLOW_BLOCKED_PUBLICATION_TOKEN]: true;
};

export type GpuFlowVisibleFramePresentationToken =
  VisibleFramePresentationTokenBrand & {
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

type GpuFlowPresentableFrame = PresentableFrameBrand & {
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
  readonly createPresentationToken: (input: {
    readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
    readonly frame: GpuFlowCommittedSurfaceFrame;
    readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowVisibleFramePresentationToken;
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
    createPresentationToken: ({
      commitAuthorityProof,
      frame,
      presentationIdentity,
      projectionSample,
    }) =>
      createGpuFlowVisibleFramePresentationToken({
        presentableFrame: createGpuFlowPresentableFrame({
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

function createGpuFlowPresentableFrame({
  frame,
  commitAuthorityProof,
  presentationIdentity,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowPresentableFrame {
  assertGpuFlowPresentationAuthorityFrame({
    frame,
    commitAuthorityProof,
    projectionSampleId: projectionSample.id,
  });
  assertGpuFlowVisibleFramePresentationIdentity({
    frame,
    presentationIdentity,
    projectionSample,
  });
  return Object.freeze({
    [GPU_FLOW_PRESENTABLE_FRAME]: true as const,
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

export function createGpuFlowVisiblePublicationCompletionPresentationToken({
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
}): GpuFlowVisibleFramePresentationToken {
  if (visibleProjectionState.sample.id !== publicationDecision.sample.id) {
    throw new Error(
      "GPU Flow visible presentation completion requires visible projection state for the selected sample.",
    );
  }
  if (
    commitAuthorityProof.expectedActorSetDigest !==
      visibleProjectionState.committedFrame.presentationProof
        .actorManifestDigest ||
    commitAuthorityProof.projectionTransactionKind !==
      visibleProjectionState.transaction.kind ||
    commitAuthorityProof.presentationPairProof.projectionSampleId !==
      publicationDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow visible presentation completion requires a commit authority proof for the selected visible frame and projection sample.",
    );
  }
  return visiblePublicationTokenIssuer.createPresentationToken({
    commitAuthorityProof,
    frame: visibleProjectionState.committedFrame,
    presentationIdentity,
    projectionSample: publicationDecision.sample,
  });
}

function createGpuFlowVisibleFramePresentationToken({
  presentableFrame,
}: {
  readonly presentableFrame: GpuFlowPresentableFrame;
}): GpuFlowVisibleFramePresentationToken {
  assertGpuFlowPresentableFrame({ presentableFrame });
  return Object.freeze({
    [GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN]: true as const,
    committedFrameId: presentableFrame.committedFrameId,
    contentFrameId: presentableFrame.contentFrameId,
    expectedActorSetDigest: presentableFrame.expectedActorSetDigest,
    presentationId: presentableFrame.presentationId,
    presentationPairDigest: presentableFrame.presentationPairDigest,
    presentationPairProof: presentableFrame.presentationPairProof,
    projectionSampleId: presentableFrame.projectionSampleId,
    proofDigest: presentableFrame.proofDigest,
    resourceProtectionDigest: presentableFrame.resourceProtectionDigest,
    transactionId: presentableFrame.transactionId,
  });
}

function assertGpuFlowVisibleFramePresentationIdentity({
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
      "GPU Flow visible frame presentation token requires the visible frame state machine identity for the selected content frame and projection sample.",
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
    frame: createGpuFlowColdStartShellFrame(frozenFrameId),
    frameId: frozenFrameId,
    kind: "cold-start-shell" as const,
  });
}

export function assertGpuFlowVisibleFramePresentationToken({
  frame,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN] !== true ||
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
      "GPU Flow presented content publication requires a visible frame presentation token for the same visible frame.",
    );
  }
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof: token.presentationPairProof,
    projectionSampleId: token.projectionSampleId,
    projectionTransactionKind:
      token.presentationPairProof.projectionTransactionKind,
    projectionTransactionId:
      token.presentationPairProof.canvasGenerationEvidence
        .projectionTransactionId,
  });
}

export function assertGpuFlowVisibleFramePresentationTokenForPresentationProof({
  frame,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN] !== true ||
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
      "GPU Flow presented content publication requires a visible frame presentation token for the same visible frame.",
    );
  }
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof: token.presentationPairProof,
    projectionSampleId: token.projectionSampleId,
    projectionTransactionKind:
      token.presentationPairProof.projectionTransactionKind,
    projectionTransactionId:
      token.presentationPairProof.canvasGenerationEvidence
        .projectionTransactionId,
  });
}

export function assertGpuFlowVisibleFramePresentationTokenForFrameId({
  committedFrameId,
  token,
}: {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN] !== true ||
    token.committedFrameId !== committedFrameId
  ) {
    throw new Error(
      `GPU Flow browser visual publication requires a visible frame presentation token for the same visible frame (expected frame ${committedFrameId}, received ${
        isGpuFlowVisibleFramePresentationToken(token)
          ? token.committedFrameId
          : "unbranded"
      }).`,
    );
  }
}

export function assertGpuFlowVisibleFramePresentationTokenForProjectionSample({
  projectionSampleId,
  token,
}: {
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  if (
    !isGpuFlowVisibleFramePresentationToken(token) ||
    token.projectionSampleId !== projectionSampleId
  ) {
    throw new Error(
      `GPU Flow visible publication debt completion requires a presentation token for the selected projection sample (expected sample ${projectionSampleId}, received sample ${
        isGpuFlowVisibleFramePresentationToken(token)
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

export function assertGpuFlowVisibleFramePresentationTokenBrand({
  token,
}: {
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  if (!isGpuFlowVisibleFramePresentationToken(token)) {
    throw new Error(
      "GPU Flow presentation-only resource release requires a visible frame presentation token.",
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
      "GPU Flow blocked candidate resource release requires a blocked publication token.",
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

function assertGpuFlowPresentableFrame({
  presentableFrame,
}: {
  readonly presentableFrame: GpuFlowPresentableFrame;
}): void {
  if (!isGpuFlowPresentableFrame(presentableFrame)) {
    throw new Error(
      "GPU Flow visible frame presentation token minting requires a presentable frame proof.",
    );
  }
}

function isGpuFlowPresentableFrame(
  presentableFrame: unknown,
): presentableFrame is GpuFlowPresentableFrame {
  return Boolean(
    presentableFrame &&
      typeof presentableFrame === "object" &&
      (
        presentableFrame as {
          readonly [GPU_FLOW_PRESENTABLE_FRAME]?: true;
        }
      )[GPU_FLOW_PRESENTABLE_FRAME] === true,
  );
}

function isGpuFlowVisibleFramePresentationToken(
  token: unknown,
): token is GpuFlowVisibleFramePresentationToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN]?: true;
        }
      )[GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN] === true,
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
  return `present:frame-${frame.displayFrameId}:sample-${projectionSample.id}`;
}
