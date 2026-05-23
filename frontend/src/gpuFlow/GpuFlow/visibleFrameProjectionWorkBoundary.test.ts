import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FLOW_PROJECTION_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowProjectionFrame.tsx", import.meta.url),
);
const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameKernel.ts", import.meta.url),
);
const KERNEL_CANDIDATE_ORACLE_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFrameActorAdapters/contentDecisionKernel.ts",
    import.meta.url,
  ),
);
const KERNEL_PROJECTION_COVERAGE_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFrameProjectionCoverage.ts",
    import.meta.url,
  ),
);
const PROJECTION_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameProjectionPlan.ts", import.meta.url),
);

describe("GPU Flow visible publication kernel projection work", () => {
  it("keeps projection-only blocked work classification out of projection rendering", () => {
    const projectionFrameSource = readFileSync(
      FLOW_PROJECTION_FRAME_MODULE_PATH,
      "utf8",
    );
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const candidateOracleSource = readFileSync(
      KERNEL_CANDIDATE_ORACLE_MODULE_PATH,
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
    expect(candidateOracleSource).toContain(
      "function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(kernelSource).not.toContain(
      "function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(kernelSource).not.toContain(
      "export function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(candidateOracleSource).not.toContain(
      "export function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(kernelSource).not.toContain(
      "export function assertGpuFlowMotionProjectionFrameWork",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowMotionProjectionFrameBlockedPublicationReasonSelector",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowMotionProjectionFrameWorkBlockedReasonSelector",
    );
    expect(candidateOracleSource).toContain(
      "function selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(kernelSource).not.toContain("resolveGpuFlowRetainedProjectionFrame");
    expect(kernelSource).not.toContain(
      "isGpuFlowRetainedProjectionSurfaceCovered",
    );
    expect(kernelSource).not.toContain(
      "export type { GpuFlowRetainedProjectionFrame }",
    );
    expect(kernelSource).not.toContain(
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
