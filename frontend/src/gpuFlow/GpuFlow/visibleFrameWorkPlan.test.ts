import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleFrameReducerDecision,
} from "../projectionRuntime";
import {
  createGpuFlowContentPreparationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  shouldConsiderGpuFlowDeferredContentPreparation,
  shouldDeferGpuFlowBrowserVisualResourceWakeupForPreparation,
  shouldSkipGpuFlowDeferredContentPreparationFrame,
} from "./visibleFrameCoordinator";

const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameSurfaceFrame.ts", import.meta.url),
);
const COORDINATOR_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
);

describe("GPU Flow visible frame coordinator work plans", () => {
  it("selects motion preparation only for motion work lanes", () => {
    expect(
      createGpuFlowMotionProjectionWorkPlan({
        reducerDecision: reducerDecision({ lane: "motion" }),
      }),
    ).toEqual({ kind: "prepare" });
    expect(
      createGpuFlowMotionProjectionWorkPlan({
        reducerDecision: reducerDecision({ lane: "content" }),
      }),
    ).toEqual({ kind: "skip" });
  });

  it("maps content preparation preparation lanes inside the coordinator", () => {
    expect(
      createGpuFlowContentPreparationWorkPlan({
        blockedProjectionOnlyFrame: false,
        reducerDecision: reducerDecision({ lane: "maintenance" }),
        renderedProjectionOnlyFrame: false,
      }),
    ).toEqual({ kind: "prepare", contentWorkLane: "maintenance" });
    expect(
      createGpuFlowContentPreparationWorkPlan({
        blockedProjectionOnlyFrame: false,
        reducerDecision: reducerDecision({ lane: "motion" }),
        renderedProjectionOnlyFrame: false,
      }),
    ).toEqual({ kind: "skip" });
    expect(
      createGpuFlowContentPreparationWorkPlan({
        blockedProjectionOnlyFrame: false,
        reducerDecision: reducerDecision({ lane: "content" }),
        renderedProjectionOnlyFrame: true,
      }),
    ).toEqual({ kind: "skip" });
    expect(
      createGpuFlowContentPreparationWorkPlan({
        blockedProjectionOnlyFrame: true,
        reducerDecision: reducerDecision({ lane: "motion" }),
        renderedProjectionOnlyFrame: false,
      }),
    ).toEqual({ kind: "skip" });
    expect(
      createGpuFlowContentPreparationWorkPlan({
        blockedProjectionOnlyFrame: false,
        reducerDecision: reducerDecision({ lane: "idle" }),
        renderedProjectionOnlyFrame: false,
      }),
    ).toEqual({ kind: "skip" });
  });

  it("keeps deferred publication policy in the coordinator without suppressing browser visual repair", () => {
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        activeEditorActivationPending: true,
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "content",
          rawReasons: ["texture-upload"],
          reducerState: "motion-settling",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: false,
        hasPreviousRetainedDisplayFrame: false,
        hasPreviousVisibleProjectionState: false,
        reducerDecision: reducerDecision({
          lane: "content",
          rawReasons: ["retained-scroll"],
          reducerState: "motion-active",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: false,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "content",
          rawReasons: ["retained-scroll"],
          reducerState: "motion-active",
        }),
      }),
    ).toBe(true);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "content",
          reducerState: "motion-settling",
        }),
      }),
    ).toBe(true);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: false,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "maintenance",
          rawReasons: ["texture-upload"],
          reducerState: "motion-settling",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: false,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "maintenance",
          rawReasons: ["texture-upload", "dom-control-activation"],
          reducerState: "motion-settling",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "motion",
          reducerState: "motion-settling",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "content",
          rawReasons: ["texture-upload", "manual"],
          reducerState: "content-catchup",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "content",
          rawReasons: ["texture-upload", "dom-control-activation"],
          reducerState: "content-catchup",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: true,
        reducerDecision: reducerDecision({
          lane: "content",
          rawReasons: ["texture-upload", "retained-native-visual"],
          reducerState: "content-catchup",
        }),
      }),
    ).toBe(false);
    expect(
      shouldConsiderGpuFlowDeferredContentPreparation({
        deferResolutionUpdates: true,
        hasPreviousRetainedDisplayFrame: true,
        hasPreviousVisibleProjectionState: false,
        reducerDecision: reducerDecision({
          lane: "content",
          rawReasons: ["texture-upload", "manual"],
          reducerState: "content-catchup",
        }),
      }),
    ).toBe(false);
    expect(
      shouldDeferGpuFlowBrowserVisualResourceWakeupForPreparation({
        deferResolutionUpdates: false,
        reducerDecision: reducerDecision({
          lane: "content",
          reducerState: "motion-active",
        }),
      }),
    ).toBe(false);
    expect(
      shouldDeferGpuFlowBrowserVisualResourceWakeupForPreparation({
        deferResolutionUpdates: true,
        reducerDecision: reducerDecision({
          lane: "content",
          reducerState: "motion-active",
        }),
      }),
    ).toBe(false);
  });

  it("keeps deferred content preparation off the hot path until a non-deferred frame", () => {
    expect(
      shouldSkipGpuFlowDeferredContentPreparationFrame({
        canReusePreparedFrame: false,
        hasPreparedFrame: false,
        hasUnpublishedPreparedSourceFrame: false,
        shouldConsiderDeferredPreparation: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipGpuFlowDeferredContentPreparationFrame({
        canReusePreparedFrame: false,
        hasPreparedFrame: true,
        hasUnpublishedPreparedSourceFrame: true,
        shouldConsiderDeferredPreparation: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipGpuFlowDeferredContentPreparationFrame({
        canReusePreparedFrame: true,
        hasPreparedFrame: true,
        hasUnpublishedPreparedSourceFrame: false,
        shouldConsiderDeferredPreparation: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipGpuFlowDeferredContentPreparationFrame({
        canReusePreparedFrame: false,
        hasPreparedFrame: true,
        hasUnpublishedPreparedSourceFrame: false,
        shouldConsiderDeferredPreparation: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipGpuFlowDeferredContentPreparationFrame({
        canReusePreparedFrame: false,
        hasPreparedFrame: false,
        hasUnpublishedPreparedSourceFrame: false,
        shouldConsiderDeferredPreparation: false,
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
    expect(surfaceSource).not.toContain('reducerDecision.lane !== "motion"');
    expect(surfaceSource).toContain("contentPreparationWorkPlan");
    expect(surfaceSource).toContain("motionProjectionWorkPlan");
    expect(coordinatorSource).toContain(
      "createGpuFlowMotionProjectionWorkPlan",
    );
    expect(coordinatorSource).toContain(
      "createGpuFlowContentPreparationWorkPlan",
    );
    expect(coordinatorSource).toContain(
      "shouldConsiderGpuFlowDeferredContentPreparation",
    );
    expect(coordinatorSource).toContain(
      "shouldDeferGpuFlowBrowserVisualResourceWakeupForPreparation",
    );
    expect(coordinatorSource).toContain(
      "shouldSkipGpuFlowDeferredContentPreparationFrame",
    );
  });
});

function reducerDecision({
  lane,
  rawReasons = [],
  reducerState = "idle",
}: {
  readonly lane: GpuFlowVisibleFrameReducerDecision["lane"];
  readonly rawReasons?: readonly GpuFrameReason[] | undefined;
  readonly reducerState?: GpuFlowVisibleFrameReducerDecision["reducerState"];
}): GpuFlowVisibleFrameReducerDecision {
  return {
    debt: {
      content: false,
      maintenance: false,
      motion: false,
    },
    lane,
    rawReasons,
    sample: liveProjectionSample(),
    reducerState,
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
