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
  type GpuFlowVisiblePublicationCommitOracle,
  type GpuFlowVisiblePublicationOutcome,
  type GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationKernel";

type GpuFlowVisiblePublicationSchedulerCompletion =
  GpuFlowVisiblePublicationTransactionCompletion["completion"];

export function postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
  commitOracle,
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly commitOracle: GpuFlowVisiblePublicationCommitOracle | null;
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  if (!isChromeReproActive()) {
    return;
  }
  postChromeReproEvent(
    "gpu-flow-visible-publication-outcome",
    createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
      commitOracle,
      completion,
      outcome,
      previousCommittedFrameId,
      publicationDecision,
      visibleProjectionState,
    }),
  );
}

export function createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
  commitOracle,
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly commitOracle: GpuFlowVisiblePublicationCommitOracle | null;
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  return createGpuFlowVisiblePublicationTransactionReport({
    commitOracle,
    completion,
    outcome,
    previousCommittedFrameId,
    publicationDecision,
    visibleProjectionState,
  });
}
