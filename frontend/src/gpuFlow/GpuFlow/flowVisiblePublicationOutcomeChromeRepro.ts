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
  type GpuFlowVisibleFramePublicationTransactionOracle,
  type GpuFlowVisiblePublicationCompletion,
  type GpuFlowVisiblePublicationOutcome,
} from "./visibleFramePublicationKernel";

type GpuFlowVisiblePublicationSchedulerCompletion =
  GpuFlowVisiblePublicationCompletion;

export function postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  transactionOracle,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle | null;
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
      transactionOracle,
      visibleProjectionState,
    }),
  );
}

export function createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  transactionOracle,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  return createGpuFlowVisiblePublicationTransactionReport({
    completion,
    outcome,
    previousCommittedFrameId,
    publicationDecision,
    transactionOracle,
    visibleProjectionState,
  });
}
