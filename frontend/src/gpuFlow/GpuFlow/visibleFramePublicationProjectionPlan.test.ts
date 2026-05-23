import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionTransaction,
} from "../projectionRuntime";
import type { GpuFlowRetainedProjectionFrame } from "./flowProjectionFrame";
import {
  selectGpuFlowProjectionFrameRenderPlan,
  type GpuFlowProjectionFrameTransaction,
} from "./visibleFramePublicationKernel";

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
  it("rejects blocked projection transactions before rendering", () => {
    expect(
      () =>
        selectGpuFlowProjectionFrameRenderPlan({
          projectionFrameTransaction: projectionFrameTransaction({
            blockedReason: "retained-projection-coverage-missing",
          }),
        }),
    ).toThrow(/nonblocked projection transaction/);
  });

  it("selects render plans for publishable projection transactions", () => {
    const transaction = projectionTransaction();
    const retainedProjectionFrame = projectionFrame();

    expect(
      selectGpuFlowProjectionFrameRenderPlan({
        projectionFrameTransaction: projectionFrameTransaction({
          retainedProjectionFrame,
          transaction,
        }),
      }),
    ).toEqual({
      heldPreviousProjection: null,
      kind: "render",
      retainedProjectionFrame,
      transaction,
    });
  });

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
    expect(projectionPlanSource).toContain(
      "projectionFrameTransaction.blockedReason",
    );
  });
});

function projectionFrameTransaction({
  blockedReason = null,
  retainedProjectionFrame = projectionFrame(),
  transaction = projectionTransaction(),
}: {
  readonly blockedReason?: string | null | undefined;
  readonly retainedProjectionFrame?: GpuFlowRetainedProjectionFrame | undefined;
  readonly transaction?: GpuFlowProjectionTransaction | undefined;
} = {}): GpuFlowProjectionFrameTransaction {
  return {
    blockedReason,
    heldPreviousProjection: null,
    retainedProjectionFrame,
    transaction,
  };
}

function projectionFrame(): GpuFlowRetainedProjectionFrame {
  return {
    flatSurfaces: [],
    missingCoverageSurfaceIds: new Set(),
    needsRetainedPageMaintenance: false,
  };
}

function projectionTransaction(): GpuFlowProjectionTransaction {
  return {
    committedFrameId: 12,
    id: "projection:12:1",
    kind: "motion-projection",
    lane: "motion",
    rawReasons: ["retained-scroll"],
    sample: liveProjectionSample(),
    startedAtMs: 16,
  };
}

function liveProjectionSample(): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id: 1,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp: 16,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}
