import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  selectGpuFlowCommittedSurfacePublicationFramePlan,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
  type GpuFlowCommittedSurfacePublicationCandidate,
} from "./visibleFramePublicationKernel";

const FLOW_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowFrame.tsx", import.meta.url),
);
const CONTENT_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationContentPlan.ts", import.meta.url),
);

describe("GPU Flow visible publication content plans", () => {
  it("selects retained display blocked plans outside flowFrame", () => {
    const plan = selectGpuFlowRetainedDisplayPublicationFramePlan({
      retainedDisplayOutcome: {
        kind: "block-cold-first-coverage",
        reason: "coverage-missing",
      },
    });

    expect(plan.kind).toBe("blocked");
    if (plan.kind !== "blocked") {
      throw new Error("Expected retained display blocked plan.");
    }
    expect(plan.frameResult.kind).toBe("retained-projection-blocked");
    expect(plan.frameResult.retainedProjectionBlockedReason).toBe(
      "coverage-missing",
    );
  });

  it("selects committed-surface publish and held plans outside flowFrame", () => {
    const committedFrame = committedSurfaceFrame();
    const publishPlan = selectGpuFlowCommittedSurfacePublicationFramePlan({
      candidate: {
        effect: { kind: "publish" },
        kind: "publish",
      },
      publishedCommittedSurfaceFrame: committedFrame,
    });
    const heldPlan = selectGpuFlowCommittedSurfacePublicationFramePlan({
      candidate: {
        effect: {
          candidateFrame: committedFrame,
          deferRetry: false,
          kind: "held-previous",
          timestamp: 16,
        },
        kind: "held-previous",
        visibleProjectionState: null,
      } as unknown as GpuFlowCommittedSurfacePublicationCandidate,
      publishedCommittedSurfaceFrame: committedFrame,
    });

    expect(publishPlan.kind).toBe("publish");
    if (publishPlan.kind !== "publish") {
      throw new Error("Expected committed-surface publish plan.");
    }
    expect(publishPlan.committedSurfacePublication.committedSurfaceFrame).toBe(
      committedFrame,
    );
    expect(heldPlan.kind).toBe("frame-result");
  });

  it("keeps retained and committed content result selection out of flowFrame", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");

    expect(flowFrameSource).not.toContain("retainedDisplayOutcomeFrameResult");
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationActionResult",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationCandidateAction",
    );
    expect(flowFrameSource).toContain(
      "selectRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).toContain(
      "selectCommittedSurfacePublicationFramePlan",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
  });
});

function committedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  return {
    displayFrameId: 7,
  } as GpuFlowCommittedSurfaceFrame;
}
