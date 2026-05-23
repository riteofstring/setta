import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { createGpuFlowBrowserVisualFaultInjectedBlockedPublicationCandidate } from "./browserVisualFaultInjectionPublication";
import type {
  GpuFlowCommittedSurfacePublicationFramePlanPreparer,
  GpuFlowRetainedDisplayPublicationFramePlanPreparer,
} from "./visibleFramePublicationContentPlan";
import type {
  GpuFlowContentPublicationWorkPlan,
  GpuFlowMotionProjectionWorkPlan,
} from "./visibleFramePublicationKernelWorkPlan";
import type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowVisibleFramePublicationFrameContext,
} from "./visibleFramePublicationKernel";
import type {
  GpuFlowVisibleFramePublicationCandidateSet,
  GpuFlowVisibleFramePublicationContentCandidate,
  GpuFlowVisibleFramePublicationMotionCandidate,
} from "./visibleFramePublicationOracle";

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
  readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
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
  prepareCommittedSurfacePublicationFramePlan,
  prepareMotionProjectionFrame,
  prepareRetainedDisplayPublicationFramePlan,
  previousVisibleProjectionState,
  publicationDecision,
  publicationFrameContext,
}: {
  readonly prepareContentPublicationFrame: GpuFlowForcedBlockedContentFramePreparer<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
  readonly prepareMotionProjectionFrame: GpuFlowForcedBlockedMotionFramePreparer<MotionProjectionFrame>;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
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
    prepareCommittedSurfacePublicationFramePlan,
    prepareRetainedDisplayPublicationFramePlan,
    publicationDecision,
    publicationFrameContext,
  });
  return Object.freeze({
    contentPublicationFrame,
    forcedBlockedPublicationCandidate,
    motionProjectionFrame,
  });
}
