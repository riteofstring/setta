import type {
  GpuFlowHeldPreviousProjection,
  GpuFlowProjectionTransaction,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuFlowRetainedProjectionFrame } from "./visibleFramePublicationProjectionCoverageAuthority";

export type GpuFlowRetainedProjectionPublicationTransactionDecision =
  | {
      readonly blockedReason: null;
      readonly heldPreviousProjection: null;
      readonly kind: "project-requested";
      readonly transaction: GpuFlowProjectionTransaction;
    }
  | {
      readonly blockedReason: null;
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection;
      readonly kind: "held-previous";
      readonly transaction: GpuFlowProjectionTransaction;
    }
  | {
      readonly blockedReason: string;
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection;
      readonly kind: "blocked";
      readonly transaction: GpuFlowProjectionTransaction;
    };

export type GpuFlowProjectionFrameTransaction = {
  readonly blockedReason: string | null;
  readonly heldPreviousProjection: GpuFlowHeldPreviousProjection | null;
  readonly retainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly transaction: GpuFlowProjectionTransaction;
};

export type GpuFlowRetainedProjectionFrameResolver = (input: {
  readonly transaction: GpuFlowProjectionTransaction;
}) => GpuFlowRetainedProjectionFrame;

export type GpuFlowProjectionFrameTransactionSelector = (input: {
  readonly publicationDecision: GpuFlowRetainedProjectionPublicationTransactionDecision;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly resolveHeldRetainedProjectionFrame: GpuFlowRetainedProjectionFrameResolver;
}) => GpuFlowProjectionFrameTransaction;

export function createGpuFlowProjectionFrameTransactionSelector(): GpuFlowProjectionFrameTransactionSelector {
  return selectGpuFlowProjectionFrameTransactionFromPublicationDecision;
}

export function hasActiveGpuFlowRetainedDomControlPublicationProof(
  retainedDisplayFrame: RetainedDisplayFrame,
): boolean {
  return retainedDisplayFrame.retainedRuntimeFrame.descriptors.domControlSources.some(
    (control) => control.active,
  );
}

function selectGpuFlowProjectionFrameTransactionFromPublicationDecision({
  publicationDecision,
  requestedRetainedProjectionFrame,
  resolveHeldRetainedProjectionFrame,
}: {
  readonly publicationDecision: GpuFlowRetainedProjectionPublicationTransactionDecision;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly resolveHeldRetainedProjectionFrame: GpuFlowRetainedProjectionFrameResolver;
}): GpuFlowProjectionFrameTransaction {
  if (publicationDecision.kind === "project-requested") {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: publicationDecision.transaction,
    };
  }
  if (publicationDecision.kind === "blocked") {
    return {
      blockedReason: publicationDecision.blockedReason,
      heldPreviousProjection: publicationDecision.heldPreviousProjection,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: publicationDecision.transaction,
    };
  }
  const heldProjectionFrame = resolveHeldRetainedProjectionFrame({
    transaction: publicationDecision.transaction,
  });
  return {
    blockedReason: null,
    heldPreviousProjection: publicationDecision.heldPreviousProjection,
    retainedProjectionFrame: {
      ...heldProjectionFrame,
      needsRetainedPageMaintenance:
        heldProjectionFrame.needsRetainedPageMaintenance ||
        requestedRetainedProjectionFrame.needsRetainedPageMaintenance,
    },
    transaction: publicationDecision.transaction,
  };
}
