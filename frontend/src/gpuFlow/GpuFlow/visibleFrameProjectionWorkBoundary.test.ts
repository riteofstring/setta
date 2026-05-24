import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FLOW_PROJECTION_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowProjectionFrame.tsx", import.meta.url),
);
const COORDINATOR_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
);
const TRANSACTION_PROOFS_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameTransactionProofs.ts", import.meta.url),
);
const CONTENT_DECISION_KERNEL_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFrameActorAdapters/contentDecisionKernel.ts",
    import.meta.url,
  ),
);
const KERNEL_PROJECTION_COVERAGE_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameProjectionCoverage.ts", import.meta.url),
);
const PROJECTION_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameProjectionPlan.ts", import.meta.url),
);
const PROJECTION_WORK_PROOF_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameProjectionWorkProof.ts", import.meta.url),
);

describe("GPU Flow visible frame coordinator projection work", () => {
  it("keeps projection-only blocked work classification out of projection rendering", () => {
    const projectionFrameSource = readFileSync(
      FLOW_PROJECTION_FRAME_MODULE_PATH,
      "utf8",
    );
    const coordinatorSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const transactionProofsSource = readFileSync(
      TRANSACTION_PROOFS_MODULE_PATH,
      "utf8",
    );
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );
    const kernelProjectionCoverageSource = readFileSync(
      KERNEL_PROJECTION_COVERAGE_MODULE_PATH,
      "utf8",
    );
    const projectionPlanSource = readFileSync(
      PROJECTION_PLAN_MODULE_PATH,
      "utf8",
    );
    const projectionWorkProofSource = readFileSync(
      PROJECTION_WORK_PROOF_MODULE_PATH,
      "utf8",
    );

    expect(projectionFrameSource).toContain("projectionOnlyFrameWork");
    expect(projectionFrameSource).not.toContain(
      "selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(projectionFrameSource).not.toContain(
      "assertGpuFlowMotionProjectionFrameWork",
    );
    expect(projectionFrameSource).not.toContain("projection-only-content-work");
    expect(projectionFrameSource).not.toContain(
      "resolveGpuFlowRetainedProjectionFrame",
    );
    expect(projectionFrameSource).not.toContain(
      "isGpuFlowRetainedProjectionSurfaceCovered",
    );
    expect(transactionProofsSource).toContain(
      "selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(projectionWorkProofSource).toContain(
      "function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(coordinatorSource).not.toContain(
      "function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(coordinatorSource).not.toContain(
      "export function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "export function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(coordinatorSource).not.toContain(
      "export function assertGpuFlowMotionProjectionFrameWork",
    );
    expect(coordinatorSource).not.toContain(
      "createGpuFlowMotionProjectionFrameBlockedPublicationReasonSelector",
    );
    expect(coordinatorSource).not.toContain(
      "createGpuFlowMotionProjectionFrameWorkBlockedReasonSelector",
    );
    expect(projectionWorkProofSource).toContain(
      "function selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(coordinatorSource).not.toContain(
      "function selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(coordinatorSource).not.toContain(
      "resolveGpuFlowRetainedProjectionFrame",
    );
    expect(coordinatorSource).not.toContain(
      "isGpuFlowRetainedProjectionSurfaceCovered",
    );
    expect(coordinatorSource).not.toContain(
      "export type { GpuFlowRetainedProjectionFrame }",
    );
    expect(coordinatorSource).not.toContain(
      "export function selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(projectionPlanSource).not.toContain(
      "selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(projectionPlanSource).not.toContain("projection-only-content-work");
    expect(kernelProjectionCoverageSource).toContain(
      "function resolveGpuFlowRetainedProjectionFrame",
    );
    expect(kernelProjectionCoverageSource).toContain(
      "function isGpuFlowRetainedProjectionSurfaceCovered",
    );
    expect(kernelProjectionCoverageSource).not.toContain(
      "export function isGpuFlowRetainedProjectionSurfaceCovered",
    );
  });
});
