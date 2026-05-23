import type { GpuFlowProjectionFrameTransaction } from "./visibleFramePublicationProjectionTransactionAuthority";

export type GpuFlowProjectionFrameRenderPlan =
  {
    readonly heldPreviousProjection: GpuFlowProjectionFrameTransaction["heldPreviousProjection"];
    readonly kind: "render";
    readonly retainedProjectionFrame: GpuFlowProjectionFrameTransaction["retainedProjectionFrame"];
    readonly transaction: GpuFlowProjectionFrameTransaction["transaction"];
  };

export type GpuFlowProjectionFrameRenderablePlan = Extract<
  GpuFlowProjectionFrameRenderPlan,
  { readonly kind: "render" }
>;

export type GpuFlowProjectionFrameRenderPlanSelector = (input: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}) => GpuFlowProjectionFrameRenderPlan;

export function createGpuFlowProjectionFrameRenderPlanSelector(): GpuFlowProjectionFrameRenderPlanSelector {
  return selectGpuFlowProjectionFrameRenderPlan;
}

export function selectGpuFlowProjectionFrameRenderPlan({
  projectionFrameTransaction,
}: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}): GpuFlowProjectionFrameRenderPlan {
  assertGpuFlowProjectionFrameTransactionRenderable(
    projectionFrameTransaction,
  );
  return {
    heldPreviousProjection: projectionFrameTransaction.heldPreviousProjection,
    kind: "render" as const,
    retainedProjectionFrame: projectionFrameTransaction.retainedProjectionFrame,
    transaction: projectionFrameTransaction.transaction,
  };
}

function assertGpuFlowProjectionFrameTransactionRenderable(
  projectionFrameTransaction: GpuFlowProjectionFrameTransaction,
): void {
  if (projectionFrameTransaction.blockedReason !== null) {
    throw new Error(
      "GPU Flow projection frame render plans require a nonblocked projection transaction.",
    );
  }
}
