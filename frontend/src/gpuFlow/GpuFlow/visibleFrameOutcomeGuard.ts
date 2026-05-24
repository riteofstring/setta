import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuFlowVisiblePublicationCompletionOutcome,
  GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";

type GpuFlowVisiblePublicationOutcomeRecord = {
  readonly outcome: GpuFlowVisiblePublicationCompletionOutcome["kind"];
  readonly projectionSampleId: number;
  readonly transactionId: string | null;
};

const visiblePublicationOutcomeBySurface = new WeakMap<
  GpuSurfaceHandle,
  GpuFlowVisiblePublicationOutcomeRecord
>();

export function assertGpuFlowSingleVisiblePublicationOutcome({
  outcome,
  publicationDecision,
  surface,
}: {
  readonly outcome: GpuFlowVisiblePublicationCompletionOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly surface: GpuSurfaceHandle | null;
}): void {
  if (!surface) {
    return;
  }
  const previousOutcome = visiblePublicationOutcomeBySurface.get(surface);
  if (previousOutcome?.projectionSampleId === publicationDecision.sample.id) {
    throw new Error(
      `GPU Flow visible publication already completed an outcome for projection sample ${publicationDecision.sample.id}: ${JSON.stringify(
        previousOutcome,
      )}`,
    );
  }
  visiblePublicationOutcomeBySurface.set(surface, {
    outcome: outcome.kind,
    projectionSampleId: publicationDecision.sample.id,
    transactionId: getGpuFlowVisiblePublicationOutcomeTransactionId(outcome),
  });
}

function getGpuFlowVisiblePublicationOutcomeTransactionId(
  outcome: GpuFlowVisiblePublicationCompletionOutcome,
): string {
  switch (outcome.kind) {
    case "blocked":
    case "commit":
    case "hold-previous":
      return outcome.token.transactionId;
  }
}
