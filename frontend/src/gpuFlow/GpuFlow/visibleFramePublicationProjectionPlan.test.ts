import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PROJECTION_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowProjectionFrame.tsx", import.meta.url),
);
const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
);
const PROJECTION_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationProjectionPlan.ts", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfaceFramePublication.ts", import.meta.url),
);

describe("GPU Flow visible publication projection plans", () => {
  it("keeps raw projection blocked-field inspection out of the renderer", () => {
    const projectionFrameSource = readFileSync(
      PROJECTION_FRAME_MODULE_PATH,
      "utf8",
    );
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const projectionPlanSource = readFileSync(
      PROJECTION_PLAN_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(projectionFrameSource).not.toContain(
      "projectionFrameTransaction.blockedReason",
    );
    expect(projectionFrameSource).not.toContain(
      'projectionFrameRenderPlan.kind === "blocked"',
    );
    expect(projectionFrameSource).not.toContain(
      "projectionFrameRenderPlan.blockedPublicationCandidate",
    );
    expect(projectionFrameSource).not.toContain(
      "selectProjectionFrameRenderPlan",
    );
    expect(projectionFrameSource).toContain("projectionFrameRenderPlan");
    expect(surfaceFrameSource).not.toContain(
      'projectionFrameRenderPlan.kind === "blocked"',
    );
    expect(kernelSource).not.toContain(
      'projectionFrameRenderPlan.kind === "blocked"',
    );
    expect(kernelSource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(kernelSource).toContain("projectionFrameTransaction.blockedReason");
    expect(kernelSource).toContain(
      "projectionFrameTransaction.blockedReason",
    );
    expect(kernelSource).toContain(
      "function selectGpuFlowProjectionFrameRenderPlan",
    );
    expect(kernelSource).not.toContain(
      "export function selectGpuFlowProjectionFrameRenderPlan",
    );
    expect(projectionPlanSource).not.toContain(
      "createGpuFlowProjectionFrameRenderPlanSelector",
    );
    expect(projectionPlanSource).not.toContain(
      "function selectGpuFlowProjectionFrameRenderPlan",
    );
    expect(projectionPlanSource).toContain(
      "export type GpuFlowProjectionFrameRenderPlan",
    );
    expect(projectionPlanSource).not.toContain(
      "export function selectGpuFlowProjectionFrameRenderPlan",
    );
  });

  it("keeps requested retained projection coverage derivation inside the kernel", () => {
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const projectionPlanSource = readFileSync(
      PROJECTION_PLAN_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(surfaceFrameSource).not.toContain(
      "requestedProjectionCoverageMissing",
    );
    expect(surfaceFrameSource).not.toContain("requestedProjectionFrame");
    expect(surfaceFrameSource).not.toContain(
      "resolveHeldRetainedProjectionFrame",
    );
    expect(surfaceFrameSource).toContain("resolveRetainedProjectionFrame");
    expect(projectionPlanSource).not.toContain(
      "requestedProjectionCoverageMissing",
    );
    expect(projectionPlanSource).not.toContain("requestedProjectionFrame");
    expect(projectionPlanSource).toContain("resolveRetainedProjectionFrame");
    expect(kernelSource).toContain("const requestedRetainedProjectionFrame");
    expect(kernelSource).toContain(
      "requestedRetainedProjectionFrame.missingCoverageSurfaceIds.size > 0",
    );
  });
});
