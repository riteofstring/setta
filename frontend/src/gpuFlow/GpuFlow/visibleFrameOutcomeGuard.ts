import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuFlowVisibleFrameReducerCompletionOutcome,
  GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";

type GpuFlowVisiblePublicationOutcomeRecord = {
  readonly outcome: GpuFlowVisibleFrameReducerCompletionOutcome["kind"];
  readonly projectionSampleId: number;
  readonly transactionId: string | null;
};

const visiblePublicationOutcomeBySurface = new WeakMap<
  GpuSurfaceHandle,
  GpuFlowVisiblePublicationOutcomeRecord
>();

export function assertGpuFlowSingleVisiblePublicationOutcome({
  outcome,
  reducerDecision,
  surface,
}: {
  readonly outcome: GpuFlowVisibleFrameReducerCompletionOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly surface: GpuSurfaceHandle | null;
}): void {
  if (!surface) {
    return;
  }
  const previousOutcome = visiblePublicationOutcomeBySurface.get(surface);
  if (previousOutcome?.projectionSampleId === reducerDecision.sample.id) {
    throw new Error(
      `GPU Flow visible publication already completed an outcome for projection sample ${reducerDecision.sample.id}: ${JSON.stringify(
        previousOutcome,
      )}`,
    );
  }
  visiblePublicationOutcomeBySurface.set(surface, {
    outcome: outcome.kind,
    projectionSampleId: reducerDecision.sample.id,
    transactionId: getGpuFlowVisiblePublicationOutcomeTransactionId(outcome),
  });
}

function getGpuFlowVisiblePublicationOutcomeTransactionId(
  outcome: GpuFlowVisibleFrameReducerCompletionOutcome,
): string {
  switch (outcome.kind) {
    case "blocked":
    case "present":
    case "hold-previous":
      return outcome.token.transactionId;
  }
}
