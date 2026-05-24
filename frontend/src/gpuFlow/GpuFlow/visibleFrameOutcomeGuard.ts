import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuFlowVisibleFrameReducerCompletionOutcome,
  GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";

type GpuFlowVisibleFramePresentationOutcomeRecord = {
  readonly outcome: GpuFlowVisibleFrameReducerCompletionOutcome["kind"];
  readonly projectionSampleId: number;
  readonly transactionId: string | null;
};

const visibleFramePresentationOutcomeBySurface = new WeakMap<
  GpuSurfaceHandle,
  GpuFlowVisibleFramePresentationOutcomeRecord
>();

export function assertGpuFlowSingleVisibleFramePresentationOutcome({
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
  const previousOutcome = visibleFramePresentationOutcomeBySurface.get(surface);
  if (previousOutcome?.projectionSampleId === reducerDecision.sample.id) {
    throw new Error(
      `GPU Flow visible frame presentation already completed an outcome for projection sample ${reducerDecision.sample.id}: ${JSON.stringify(
        previousOutcome,
      )}`,
    );
  }
  visibleFramePresentationOutcomeBySurface.set(surface, {
    outcome: outcome.kind,
    projectionSampleId: reducerDecision.sample.id,
    transactionId:
      getGpuFlowVisibleFramePresentationOutcomeTransactionId(outcome),
  });
}

function getGpuFlowVisibleFramePresentationOutcomeTransactionId(
  outcome: GpuFlowVisibleFrameReducerCompletionOutcome,
): string {
  switch (outcome.kind) {
    case "blocked":
    case "present":
    case "hold-previous":
      return outcome.token.transactionId;
  }
}
