import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  createGpuFlowContentPublicationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  shouldConsiderGpuFlowDeferredContentPublication,
  shouldDeferGpuFlowBrowserVisualRetryForPublication,
} from "./visibleFrameCoordinator";

const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameSurfaceFrame.ts", import.meta.url),
);
const COORDINATOR_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
);

describe("GPU Flow visible frame coordinator work plans", () => {
  it("selects motion preparation only for motion publication lanes", () => {
    expect(
      createGpuFlowMotionProjectionWorkPlan({
        publicationDecision: publicationDecision({ lane: "motion" }),
      }),
    ).toEqual({ kind: "prepare" });
    expect(
      createGpuFlowMotionProjectionWorkPlan({
        publicationDecision: publicationDecision({ lane: "content" }),
      }),
    ).toEqual({ kind: "skip" });
  });

  it("maps content publication preparation lanes inside the coordinator", () => {
    expect(
      createGpuFlowContentPublicationWorkPlan({
        blockedProjectionOnlyFrame: false,
        publicationDecision: publicationDecision({ lane: "maintenance" }),
        renderedProjectionOnlyFrame: false,
      }),
    ).toEqual({ kind: "prepare", publicationLane: "maintenance" });
    expect(
      createGpuFlowContentPublicationWorkPlan({
        blockedProjectionOnlyFrame: false,
        publicationDecision: publicationDecision({ lane: "motion" }),
        renderedProjectionOnlyFrame: false,
      }),
    ).toEqual({ kind: "prepare", publicationLane: "content" });
    expect(
      createGpuFlowContentPublicationWorkPlan({
        blockedProjectionOnlyFrame: false,
        publicationDecision: publicationDecision({ lane: "content" }),
        renderedProjectionOnlyFrame: true,
      }),
    ).toEqual({ kind: "skip" });
    expect(
      createGpuFlowContentPublicationWorkPlan({
        blockedProjectionOnlyFrame: true,
        publicationDecision: publicationDecision({ lane: "motion" }),
        renderedProjectionOnlyFrame: false,
      }),
    ).toEqual({ kind: "skip" });
    expect(
      createGpuFlowContentPublicationWorkPlan({
        blockedProjectionOnlyFrame: false,
        publicationDecision: publicationDecision({ lane: "idle" }),
        renderedProjectionOnlyFrame: false,
      }),
    ).toEqual({ kind: "skip" });
  });

  it("keeps deferred publication policy in the coordinator without suppressing browser visual repair", () => {
    expect(
      shouldConsiderGpuFlowDeferredContentPublication({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        publicationDecision: publicationDecision({
          lane: "content",
          schedulerState: "motion-settling",
        }),
      }),
    ).toBe(true);
    expect(
      shouldConsiderGpuFlowDeferredContentPublication({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        publicationDecision: publicationDecision({
          lane: "motion",
          schedulerState: "motion-settling",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPublication({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        publicationDecision: publicationDecision({
          lane: "content",
          rawReasons: ["texture-upload", "manual"],
          schedulerState: "content-catchup",
        }),
      }),
    ).toBe(true);
    expect(
      shouldConsiderGpuFlowDeferredContentPublication({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        publicationDecision: publicationDecision({
          lane: "content",
          rawReasons: ["texture-upload", "dom-control-activation"],
          schedulerState: "content-catchup",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPublication({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        publicationDecision: publicationDecision({
          lane: "content",
          rawReasons: ["texture-upload", "retained-native-visual"],
          schedulerState: "content-catchup",
        }),
      }),
    ).toBe(false);
    expect(
      shouldDeferGpuFlowBrowserVisualRetryForPublication({
        deferResolutionUpdates: false,
        publicationDecision: publicationDecision({
          lane: "content",
          schedulerState: "motion-active",
        }),
      }),
    ).toBe(false);
    expect(
      shouldDeferGpuFlowBrowserVisualRetryForPublication({
        deferResolutionUpdates: true,
        publicationDecision: publicationDecision({
          lane: "content",
          schedulerState: "motion-active",
        }),
      }),
    ).toBe(false);
  });

  it("keeps prepare-work lane gates out of surface frame publication", () => {
    const surfaceSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const coordinatorSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");

    expect(surfaceSource).not.toContain(
      "function shouldPublishGpuFlowContentFrame",
    );
    expect(surfaceSource).not.toContain("getGpuFlowContentPublicationLane");
    expect(surfaceSource).not.toContain(
      'publicationDecision.lane !== "motion"',
    );
    expect(surfaceSource).toContain("contentPublicationWorkPlan");
    expect(surfaceSource).toContain("motionProjectionWorkPlan");
    expect(coordinatorSource).toContain(
      "createGpuFlowMotionProjectionWorkPlan",
    );
    expect(coordinatorSource).toContain(
      "createGpuFlowContentPublicationWorkPlan",
    );
    expect(coordinatorSource).toContain(
      "shouldConsiderGpuFlowDeferredContentPublication",
    );
    expect(coordinatorSource).toContain(
      "shouldDeferGpuFlowBrowserVisualRetryForPublication",
    );
  });
});

function publicationDecision({
  lane,
  rawReasons = [],
  schedulerState = "idle",
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly rawReasons?: readonly GpuFrameReason[] | undefined;
  readonly schedulerState?: GpuFlowVisiblePublicationDecision["schedulerState"];
}): GpuFlowVisiblePublicationDecision {
  return {
    debt: {
      content: false,
      maintenance: false,
      motion: false,
    },
    lane,
    rawReasons,
    sample: liveProjectionSample(),
    schedulerState,
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
