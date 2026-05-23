import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FLOW_PROJECTION_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowProjectionFrame.tsx", import.meta.url),
);
const PROJECTION_WORK_AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFramePublicationProjectionWorkAuthority.ts",
    import.meta.url,
  ),
);
const PROJECTION_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationProjectionPlan.ts", import.meta.url),
);

describe("GPU Flow visible publication projection work authority", () => {
  it("keeps projection-only blocked work classification out of projection rendering", () => {
    const projectionFrameSource = readFileSync(
      FLOW_PROJECTION_FRAME_MODULE_PATH,
      "utf8",
    );
    const authoritySource = readFileSync(
      PROJECTION_WORK_AUTHORITY_MODULE_PATH,
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
    expect(projectionFrameSource).not.toContain(
      "projection-only-content-work",
    );
    expect(authoritySource).toContain(
      "selectGpuFlowMotionProjectionFrameBlockedPublicationReason",
    );
    expect(authoritySource).toContain(
      "assertGpuFlowMotionProjectionFrameWork",
    );
    expect(authoritySource).toContain(
      "selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(projectionPlanSource).not.toContain(
      "selectGpuFlowMotionProjectionFrameWorkBlockedReason",
    );
    expect(projectionPlanSource).not.toContain(
      "projection-only-content-work",
    );
  });
});
