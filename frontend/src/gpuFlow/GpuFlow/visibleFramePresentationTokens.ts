import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  assertGpuFlowPresentationAuthorityFrame,
  assertGpuFlowPresentationPairProof,
  createGpuFlowActorManifestDigest,
  createGpuFlowPresentationPairDigest,
  createGpuFlowPresentationResourceProtectionDigestForFrame,
  createGpuFlowVisibleProofDigest,
  type GpuFlowPresentationAuthorityProof,
  type GpuFlowPresentationPairProof,
} from "./visibleFramePresentationAuthorityProofs";
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
const GPU_FLOW_BLOCKED_PRESENTATION_TOKEN = Symbol(
  "GpuFlowBlockedPresentationToken",
);

type GpuFlowVisibleTransactionId = string;
type GpuFlowPreparedVisibleFrameId = number;
type GpuFlowProjectionSampleId = number;
type GpuFlowActorManifestDigest = string;
type GpuFlowVisibleProofDigest = string;
type GpuFlowPresentationPairDigest = string;
type GpuFlowResourceProtectionDigest = string;

export type GpuFlowBlockedFrozenFrame =
  | {
      readonly frameId: GpuFlowPreparedVisibleFrameId;
      readonly kind: "presented";
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

type BlockedPresentationTokenBrand = {
  readonly [GPU_FLOW_BLOCKED_PRESENTATION_TOKEN]: true;
};

export type GpuFlowVisibleFramePresentationToken =
  VisibleFramePresentationTokenBrand & {
    readonly preparedContentFrameId: GpuFlowPreparedVisibleFrameId;
    readonly contentFrameId: GpuFlowVisibleFramePresentationIdentity["contentFrameId"];
    readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
    readonly presentationId: GpuFlowVisibleFramePresentationIdentity["presentationId"];
    readonly presentationPairDigest: GpuFlowPresentationPairDigest;
    readonly presentationPairProof: GpuFlowPresentationPairProof;
    readonly projectionSampleId: GpuFlowProjectionSampleId;
    readonly proofDigest: GpuFlowVisibleProofDigest;
    readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
    readonly transactionId: GpuFlowVisibleTransactionId;
  };

type GpuFlowPresentableFrame = PresentableFrameBrand & {
  readonly preparedContentFrameId: GpuFlowPreparedVisibleFrameId;
  readonly contentFrameId: GpuFlowVisibleFramePresentationIdentity["contentFrameId"];
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationId: GpuFlowVisibleFramePresentationIdentity["presentationId"];
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

export type GpuFlowHoldPreviousToken = HoldPreviousTokenBrand & {
  readonly preparedContentFrameId: GpuFlowPreparedVisibleFrameId;
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

export type GpuFlowBlockedPresentationToken = BlockedPresentationTokenBrand & {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrame: GpuFlowBlockedFrozenFrame;
  readonly frozenFrameId:
    | GpuFlowPreparedVisibleFrameId
    | GpuFlowColdStartShellFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

type GpuFlowVisibleFramePresentationTokenIssuer = {
  readonly createBlockedPresentationToken: (input: {
    readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
    readonly frozenFrameId:
      | GpuFlowPreparedVisibleFrameId
      | GpuFlowColdStartShellFrameId;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowBlockedPresentationToken;
  readonly createPresentationToken: (input: {
    readonly presentationAuthorityProof: GpuFlowPresentationAuthorityProof;
    readonly frame: GpuFlowPreparedContentFrame;
    readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowVisibleFramePresentationToken;
  readonly createHoldPreviousToken: (input: {
    readonly preparedContentFrameId: GpuFlowPreparedVisibleFrameId;
    readonly holdAgeFrames: number;
    readonly holdAgeMs: number;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowHoldPreviousToken;
};

function createGpuFlowVisibleFramePresentationTokenIssuer(): GpuFlowVisibleFramePresentationTokenIssuer {
  return Object.freeze({
    createBlockedPresentationToken: createGpuFlowBlockedPresentationToken,
    createPresentationToken: ({
      presentationAuthorityProof,
      frame,
      presentationIdentity,
      projectionSample,
    }) =>
      createGpuFlowVisibleFramePresentationToken({
        presentableFrame: createGpuFlowPresentableFrame({
          presentationAuthorityProof,
          frame,
          presentationIdentity,
          projectionSample,
        }),
      }),
    createHoldPreviousToken: createGpuFlowHoldPreviousToken,
  });
}

const visibleFramePresentationTokenIssuer =
  createGpuFlowVisibleFramePresentationTokenIssuer();

function createGpuFlowPresentableFrame({
  frame,
  presentationAuthorityProof,
  presentationIdentity,
  projectionSample,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationAuthorityProof: GpuFlowPresentationAuthorityProof;
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowPresentableFrame {
  assertGpuFlowPresentationAuthorityFrame({
    frame,
    presentationAuthorityProof,
    projectionSampleId: projectionSample.id,
  });
  assertGpuFlowVisibleFramePresentationIdentity({
    frame,
    presentationIdentity,
    projectionSample,
  });
  return Object.freeze({
    [GPU_FLOW_PRESENTABLE_FRAME]: true as const,
    preparedContentFrameId: frame.displayFrameId,
    contentFrameId: presentationIdentity.contentFrameId,
    expectedActorSetDigest: presentationAuthorityProof.expectedActorSetDigest,
    presentationId: presentationIdentity.presentationId,
    presentationPairDigest: presentationAuthorityProof.presentationPairDigest,
    presentationPairProof: presentationAuthorityProof.presentationPairProof,
    projectionSampleId: projectionSample.id,
    proofDigest: presentationAuthorityProof.proofDigest,
    resourceProtectionDigest:
      presentationAuthorityProof.resourceProtectionDigest,
    transactionId: createGpuFlowVisibleTransactionId({
      frame,
      projectionSample,
    }),
  });
}

export function createGpuFlowVisibleFrameHoldPreviousToken({
  preparedContentFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly preparedContentFrameId: number;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  return visibleFramePresentationTokenIssuer.createHoldPreviousToken({
    preparedContentFrameId,
    holdAgeFrames,
    holdAgeMs,
    projectionSample,
  });
}

export function createGpuFlowVisibleFrameBlockedPresentationToken({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPresentationToken["frozenFrameId"];
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPresentationToken {
  return visibleFramePresentationTokenIssuer.createBlockedPresentationToken({
    blockedReasons,
    frozenFrameId,
    projectionSample,
  });
}

export function createGpuFlowVisibleFrameReducerCompletionPresentationToken({
  presentationAuthorityProof,
  reducerDecision,
  presentationIdentity,
  visibleProjectionState,
}: {
  readonly presentationAuthorityProof: GpuFlowPresentationAuthorityProof;
  readonly reducerDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowVisibleFramePresentationToken {
  if (visibleProjectionState.sample.id !== reducerDecision.sample.id) {
    throw new Error(
      "GPU Flow visible presentation completion requires visible projection state for the selected sample.",
    );
  }
  if (
    presentationAuthorityProof.expectedActorSetDigest !==
      visibleProjectionState.preparedContentFrame.presentationProof
        .actorManifestDigest ||
    presentationAuthorityProof.projectionTransactionKind !==
      visibleProjectionState.transaction.kind ||
    presentationAuthorityProof.presentationPairProof.projectionSampleId !==
      reducerDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow visible presentation completion requires a presentation authority proof for the selected visible frame and projection sample.",
    );
  }
  return visibleFramePresentationTokenIssuer.createPresentationToken({
    presentationAuthorityProof,
    frame: visibleProjectionState.preparedContentFrame,
    presentationIdentity,
    projectionSample: reducerDecision.sample,
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
    preparedContentFrameId: presentableFrame.preparedContentFrameId,
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  preparedContentFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly preparedContentFrameId: GpuFlowPreparedVisibleFrameId;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  return Object.freeze({
    [GPU_FLOW_HOLD_PREVIOUS_TOKEN]: true as const,
    preparedContentFrameId,
    holdAgeFrames,
    holdAgeMs,
    projectionSampleId: projectionSample.id,
    transactionId: `hold:frame-${preparedContentFrameId}:sample-${projectionSample.id}`,
  });
}

function createGpuFlowBlockedPresentationToken({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId:
    | GpuFlowPreparedVisibleFrameId
    | GpuFlowColdStartShellFrameId;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPresentationToken {
  const frozenFrame = createGpuFlowBlockedFrozenFrame(frozenFrameId);
  return Object.freeze({
    [GPU_FLOW_BLOCKED_PRESENTATION_TOKEN]: true as const,
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
  frozenFrameId: GpuFlowPreparedVisibleFrameId | GpuFlowColdStartShellFrameId,
): GpuFlowBlockedFrozenFrame {
  if (typeof frozenFrameId === "number") {
    return Object.freeze({
      frameId: frozenFrameId,
      kind: "presented" as const,
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
  readonly frame: GpuFlowPreparedContentFrame;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN] !== true ||
    token.preparedContentFrameId !== frame.displayFrameId ||
    token.expectedActorSetDigest !== createGpuFlowActorManifestDigest(frame) ||
    token.proofDigest !== createGpuFlowVisibleProofDigest(frame) ||
    token.resourceProtectionDigest !==
      createGpuFlowPresentationResourceProtectionDigestForFrame({ frame }) ||
    !token.presentationPairProof ||
    token.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({
        frame,
        presentationPairProof: token.presentationPairProof,
        projectionSampleId: token.projectionSampleId,
      })
  ) {
    throw new Error(
      "GPU Flow presented content preparation requires a visible frame presentation token for the same visible frame.",
    );
  }
  assertGpuFlowPresentationPairProof({
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
  readonly frame: GpuFlowPreparedContentFrame;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN] !== true ||
    token.preparedContentFrameId !== frame.displayFrameId ||
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
      "GPU Flow presented content preparation requires a visible frame presentation token for the same visible frame.",
    );
  }
  assertGpuFlowPresentationPairProof({
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
  preparedContentFrameId,
  token,
}: {
  readonly preparedContentFrameId: GpuFlowPreparedVisibleFrameId;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_VISIBLE_FRAME_PRESENTATION_TOKEN] !== true ||
    token.preparedContentFrameId !== preparedContentFrameId
  ) {
    throw new Error(
      `GPU Flow browser visual presentation requires a visible frame presentation token for the same visible frame (expected frame ${preparedContentFrameId}, received ${
        isGpuFlowVisibleFramePresentationToken(token)
          ? token.preparedContentFrameId
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
      `GPU Flow visible reducer debt completion requires a presentation token for the selected projection sample (expected sample ${projectionSampleId}, received sample ${
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
      "GPU Flow visible reducer debt completion requires a hold-previous token for the selected projection sample.",
    );
  }
}

export function assertGpuFlowBlockedPresentationTokenForProjectionSample({
  projectionSampleId,
  token,
}: {
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly token: GpuFlowBlockedPresentationToken;
}): void {
  if (
    !isGpuFlowBlockedPresentationToken(token) ||
    token.projectionSampleId !== projectionSampleId
  ) {
    throw new Error(
      "GPU Flow visible reducer debt completion requires a blocked token for the selected projection sample.",
    );
  }
}

export function assertGpuFlowPreparedCandidateAbortToken({
  token,
}: {
  readonly token: GpuFlowBlockedPresentationToken | GpuFlowHoldPreviousToken;
}): void {
  if (
    !isGpuFlowBlockedPresentationToken(token) &&
    !isGpuFlowHoldPreviousToken(token)
  ) {
    throw new Error(
      "GPU Flow prepared browser visual abort requires a hold-previous or blocked presentation token.",
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

export function assertGpuFlowBlockedPresentationTokenBrand({
  token,
}: {
  readonly token: GpuFlowBlockedPresentationToken;
}): void {
  if (!isGpuFlowBlockedPresentationToken(token)) {
    throw new Error(
      "GPU Flow blocked candidate resource release requires a blocked presentation token.",
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
      "GPU Flow held-previous visible frame presentation requires a hold-previous presentation token.",
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

function isGpuFlowBlockedPresentationToken(
  token: unknown,
): token is GpuFlowBlockedPresentationToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_BLOCKED_PRESENTATION_TOKEN]?: true;
        }
      )[GPU_FLOW_BLOCKED_PRESENTATION_TOKEN] === true,
  );
}

function createGpuFlowVisibleTransactionId({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleTransactionId {
  return `present:frame-${frame.displayFrameId}:sample-${projectionSample.id}`;
}
