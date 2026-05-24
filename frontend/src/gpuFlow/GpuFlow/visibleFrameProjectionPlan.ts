import type {
  GpuFlowHeldPreviousProjection,
  GpuFlowProjectionTransaction,
} from "../projectionRuntime";
import type { GpuFlowVisibleFrameBlockedPresentationCandidate } from "./visibleFrameContentPlan";
import type { GpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";
import type { GpuFlowVisibleFramePresentationMotionCandidate } from "./visibleFrameTransactionProofs";

export type GpuFlowProjectionFrameTransaction = {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly blockedReason: string | null;
  readonly heldPreviousProjection: GpuFlowHeldPreviousProjection | null;
  readonly retainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly transaction: GpuFlowProjectionTransaction;
};

export type GpuFlowRetainedProjectionFrameResolver = (input: {
  readonly transaction: GpuFlowProjectionTransaction;
}) => GpuFlowRetainedProjectionFrame;

export type GpuFlowProjectionFrameRenderPlan = {
  readonly heldPreviousProjection: GpuFlowProjectionFrameTransaction["heldPreviousProjection"];
  readonly kind: "render";
  readonly retainedProjectionFrame: GpuFlowProjectionFrameTransaction["retainedProjectionFrame"];
  readonly transaction: GpuFlowProjectionFrameTransaction["transaction"];
};

export type GpuFlowProjectionFrameRenderablePlan = Extract<
  GpuFlowProjectionFrameRenderPlan,
  { readonly kind: "render" }
>;

export type GpuFlowMotionProjectionFramePreparation<
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
> =
  | {
      readonly frame: MotionProjectionFrame;
      readonly kind: "not-rendered";
    }
  | {
      readonly createBlockedProjectionFrame: (input: {
        readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate;
      }) => MotionProjectionFrame;
      readonly kind: "render";
      readonly requestedTransaction: GpuFlowProjectionTransaction;
      readonly resolveRetainedProjectionFrame: GpuFlowRetainedProjectionFrameResolver;
      readonly renderProjectionFrame: (input: {
        readonly projectionFrameRenderPlan: GpuFlowProjectionFrameRenderablePlan;
        readonly requestedProjectionTransaction: GpuFlowProjectionTransaction;
      }) => MotionProjectionFrame;
    };
