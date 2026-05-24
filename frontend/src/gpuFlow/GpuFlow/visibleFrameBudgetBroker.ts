import type { GpuFlowVisiblePublicationDecision } from "../projectionRuntime";

type GpuFlowVisibleFrameBudgetBrokerDecision = {
  readonly browserVisualRepair: {
    readonly eligible: true;
    readonly priority: "safety";
  };
  readonly resolutionUpdates: {
    readonly deferred: boolean;
  };
};

export function createGpuFlowVisibleFrameBudgetBrokerDecision({
  deferResolutionUpdates,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: Pick<
    GpuFlowVisiblePublicationDecision,
    "lane" | "schedulerState"
  >;
}): GpuFlowVisibleFrameBudgetBrokerDecision {
  return Object.freeze({
    browserVisualRepair: Object.freeze({
      eligible: true as const,
      priority: "safety" as const,
    }),
    resolutionUpdates: Object.freeze({
      deferred: deferResolutionUpdates,
    }),
  });
}

export function shouldDeferGpuFlowBrowserVisualRepairForBudget(
  input: Parameters<typeof createGpuFlowVisibleFrameBudgetBrokerDecision>[0],
): boolean {
  return !createGpuFlowVisibleFrameBudgetBrokerDecision(input)
    .browserVisualRepair.eligible;
}
