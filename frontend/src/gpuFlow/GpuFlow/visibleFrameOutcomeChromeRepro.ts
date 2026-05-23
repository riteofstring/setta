import {
  isChromeReproActive,
  postChromeReproEvent,
} from "state/actions/chromeRepro";

import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  createGpuFlowVisiblePublicationTransactionReport,
  type GpuFlowVisibleFramePublicationTransactionProof,
  type GpuFlowVisiblePublicationCompletion,
  type GpuFlowVisiblePublicationOutcome,
} from "./visibleFrameKernel";

type GpuFlowVisiblePublicationSchedulerCompletion =
  GpuFlowVisiblePublicationCompletion;

export function postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  transactionProof,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  if (!isChromeReproActive()) {
    return;
  }
  postChromeReproEvent(
    "gpu-flow-visible-publication-outcome",
    createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
      completion,
      outcome,
      previousCommittedFrameId,
      publicationDecision,
      transactionProof,
      visibleProjectionState,
    }),
  );
}

export function createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  transactionProof,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  return createGpuFlowVisiblePublicationTransactionReport({
    completion,
    outcome,
    previousCommittedFrameId,
    publicationDecision,
    transactionProof,
    visibleProjectionState,
  });
}
