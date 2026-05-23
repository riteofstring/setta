import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult,
  resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult,
  selectGpuFlowCommittedSurfacePublicationFramePlan,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
  type GpuFlowCommittedSurfacePublicationCandidate,
} from "./visibleFramePublicationKernel";

const FLOW_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowFrame.tsx", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfaceFramePublication.ts", import.meta.url),
);
const CONTENT_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationContentPlan.ts", import.meta.url),
);

describe("GPU Flow visible publication content plans", () => {
  it("selects retained display blocked plans outside flowFrame", () => {
    const plan = selectGpuFlowRetainedDisplayPublicationFramePlan({
      previousVisibleProjectionState: null,
      retainedDisplayOutcome: {
        kind: "block-cold-first-coverage",
        reason: "coverage-missing",
      },
    });

    expect(plan.kind).toBe("blocked");
    if (plan.kind !== "blocked") {
      throw new Error("Expected retained display blocked plan.");
    }
    expect(plan.blockedPublicationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: "coverage-missing",
        },
      ],
      frozenFrameId: "cold-start-shell:retained-projection",
    });
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
    expect(heldPlan.kind).toBe("candidate");
    if (heldPlan.kind !== "candidate") {
      throw new Error("Expected committed-surface held candidate plan.");
    }
    expect(heldPlan.visibleProjectionState).toBeNull();
  });

  it("keeps retained and committed content result selection out of flowFrame", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");

    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationFramePlanResult.blockedPublicationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationFramePlanResult.blockedPublicationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationFramePlanResult.visibleProjectionState",
    );
    expect(flowFrameSource).not.toContain("retainedDisplayOutcomeFrameResult");
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationActionResult",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationCandidateAction",
    );
    expect(flowFrameSource).not.toContain(
      "selectRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "selectCommittedSurfacePublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationFramePlan.kind",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationFramePlan.kind",
    );
    expect(flowFrameSource).not.toContain("framePlanResult");
    expect(flowFrameSource).toContain("nodeLayerFrameResult");
    expect(flowFrameSource).toContain("publishedOutcomeFrame");
    expect(flowFrameSource).toContain(
      "prepareRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).toContain(
      "prepareCommittedSurfacePublicationFramePlan",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).toContain("nodeLayerFrameResult:");
    expect(contentPlanSource).toContain(
      "publishedOutcomeFrame: framePlanResult.publishedOutcomeFrame",
    );
  });

  it("converts retained and committed candidate plans to node-layer results outside flowFrame", () => {
    const blockedPublicationCandidate = {
      blockedReasons: [
        {
          actorId: "actor-a",
          family: "dom-control",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: 7,
    };
    const retainedResult =
      resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult({
        framePlanResult: {
          blockedPublicationCandidate,
          publishedOutcomeFrame: null,
        },
      });
    const committedSurfacePublication = {
      blockedSurfacePublication: null,
      committedSurfaceFrame: null,
      committedSurfacePublicationEffect: null,
      heldPreparedCommittedSurfaceFrame: null,
    };
    const committedResult =
      resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult({
        framePlanResult: {
          blockedPublicationCandidate,
          committedSurfacePublication,
          visibleProjectionState: null,
        },
      });

    expect(retainedResult).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate,
        kind: "not-rendered",
      }),
    );
    expect(committedResult).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate,
        committedSurfacePublication,
        kind: "not-rendered",
      }),
    );
  });

  it("keeps content publication frame-result derivation out of the surface frame", () => {
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");

    expect(surfaceFrameSource).not.toContain(
      "function createGpuFlowVisibleContentPublicationFrameResult",
    );
    expect(surfaceFrameSource).not.toContain(
      "function createGpuFlowNotVisibleContentPublicationFrameResult",
    );
    expect(contentPlanSource).toContain(
      "function createGpuFlowVisibleContentPublicationFrameResult",
    );
    expect(contentPlanSource).toContain(
      "function createGpuFlowNotVisibleContentPublicationFrameResult",
    );
  });
});

function committedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  return {
    displayFrameId: 7,
  } as GpuFlowCommittedSurfaceFrame;
}
