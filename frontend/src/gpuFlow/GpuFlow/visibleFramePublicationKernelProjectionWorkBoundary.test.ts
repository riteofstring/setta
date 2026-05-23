import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FLOW_PROJECTION_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowProjectionFrame.tsx", import.meta.url),
);
const KERNEL_PROJECTION_WORK_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFramePublicationKernelProjectionWork.ts",
    import.meta.url,
  ),
);
const KERNEL_PROJECTION_COVERAGE_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFramePublicationKernelProjectionCoverage.ts",
    import.meta.url,
  ),
);
const PROJECTION_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationProjectionPlan.ts", import.meta.url),
);

describe("GPU Flow visible publication kernel projection work", () => {
  it("keeps projection-only blocked work classification out of projection rendering", () => {
    const projectionFrameSource = readFileSync(
      FLOW_PROJECTION_FRAME_MODULE_PATH,
      "utf8",
    );
    const kernelProjectionWorkSource = readFileSync(
      KERNEL_PROJECTION_WORK_MODULE_PATH,
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
    expect(kernelProjectionWorkSource).toContain(
      "function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(kernelProjectionWorkSource).not.toContain(
      "export function selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(kernelProjectionWorkSource).toContain(
      "assertGpuFlowMotionProjectionFrameWork",
    );
    expect(kernelProjectionWorkSource).toContain(
      "function selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(kernelProjectionWorkSource).not.toContain(
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
  });
});
