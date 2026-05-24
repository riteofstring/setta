import { describe, expect, it } from "vitest";

import type { GpuFlowVisiblePublicationDecision } from "../projectionRuntime";
import {
  createGpuFlowVisibleFrameBudgetBrokerDecision,
  shouldDeferGpuFlowBrowserVisualRepairForBudget,
} from "./visibleFrameBudgetBroker";

describe("GPU Flow visible frame budget broker", () => {
  it("keeps browser visual repair eligible during motion-heavy frames", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: true,
      publicationDecision: publicationDecision({
        lane: "content",
        schedulerState: "motion-active",
      }),
    });

    expect(decision.browserVisualRepair).toEqual({
      eligible: true,
      priority: "safety",
    });
    expect(decision.resolutionUpdates).toEqual({ deferred: true });
    expect(
      shouldDeferGpuFlowBrowserVisualRepairForBudget({
        deferResolutionUpdates: true,
        publicationDecision: publicationDecision({
          lane: "content",
          schedulerState: "motion-active",
        }),
      }),
    ).toBe(false);
  });
});

function publicationDecision({
  lane,
  schedulerState,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
}): Pick<GpuFlowVisiblePublicationDecision, "lane" | "schedulerState"> {
  return { lane, schedulerState };
}
