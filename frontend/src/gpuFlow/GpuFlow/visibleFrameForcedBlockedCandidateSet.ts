import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { createGpuFlowBrowserVisualFaultInjectedBlockedPublicationCandidate } from "./browserVisualFaultInjectionPublication";
import type { GpuFlowRetainedCommittedSurfacePublicationContentStageRunner } from "./visibleFrameContentPlan";
import type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowVisibleFramePublicationFrameContext,
} from "./visibleFrameKernel";
import type {
  GpuFlowContentPublicationWorkPlan,
  GpuFlowMotionProjectionWorkPlan,
} from "./visibleFrameWorkPlan";
import type {
  GpuFlowVisibleFramePublicationCandidateSet,
  GpuFlowVisibleFramePublicationContentCandidate,
  GpuFlowVisibleFramePublicationMotionCandidate,
} from "./visibleFrameTransactionProofs";

type GpuFlowForcedBlockedContentFramePreparer<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = (input: {
  readonly contentPublicationWorkPlan: GpuFlowContentPublicationWorkPlan;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  readonly runRetainedCommittedSurfacePublicationContentStage: GpuFlowRetainedCommittedSurfacePublicationContentStageRunner;
}) => ContentPublicationFrame;

type GpuFlowForcedBlockedMotionFramePreparer<
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = (input: {
  readonly motionProjectionWorkPlan: GpuFlowMotionProjectionWorkPlan;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
}) => GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;

export function prepareGpuFlowForcedBlockedVisibleFramePublicationCandidateSet<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  prepareContentPublicationFrame,
  prepareMotionProjectionFrame,
  previousVisibleProjectionState,
  publicationDecision,
  publicationFrameContext,
  runRetainedCommittedSurfacePublicationContentStage,
}: {
  readonly prepareContentPublicationFrame: GpuFlowForcedBlockedContentFramePreparer<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowForcedBlockedMotionFramePreparer<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  readonly runRetainedCommittedSurfacePublicationContentStage: GpuFlowRetainedCommittedSurfacePublicationContentStageRunner;
}): GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> | null {
  const forcedBlockedPublicationCandidate =
    createGpuFlowBrowserVisualFaultInjectedBlockedPublicationCandidate({
      previousVisibleProjectionState,
    });
  if (!forcedBlockedPublicationCandidate) {
    return null;
  }
  const motionPreparation = prepareMotionProjectionFrame({
    motionProjectionWorkPlan: Object.freeze({
      kind: "skip",
    } satisfies GpuFlowMotionProjectionWorkPlan),
    previousVisibleProjectionState,
    publicationDecision,
    publicationFrameContext,
  });
  if (motionPreparation.kind !== "not-rendered") {
    throw new Error(
      "GPU Flow forced blocked publication requires skipped motion preparation.",
    );
  }
  const motionProjectionFrame = motionPreparation.frame;
  const contentPublicationFrame = prepareContentPublicationFrame({
    contentPublicationWorkPlan: Object.freeze({
      kind: "skip",
    } satisfies GpuFlowContentPublicationWorkPlan),
    motionProjectionFrame,
    previousVisibleProjectionState,
    publicationDecision,
    publicationFrameContext,
    runRetainedCommittedSurfacePublicationContentStage,
  });
  return Object.freeze({
    contentPublicationFrame,
    forcedBlockedPublicationCandidate,
    motionProjectionFrame,
  });
}
