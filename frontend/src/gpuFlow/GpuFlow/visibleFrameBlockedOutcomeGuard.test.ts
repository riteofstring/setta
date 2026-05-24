import { describe, expect, it } from "vitest";

import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleFrameReducerDecision,
} from "../projectionRuntime";
import { recordGpuFlowBlockedPublicationGuard } from "./visibleFrameBlockedOutcomeGuard";
import {
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
  type GpuFlowVisibleFrameReducerCompletionOutcome,
} from "./visibleFrameReducerRuntime";
import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
} from "./visibleFrameTestUtils";
import { GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

describe("GPU Flow blocked visible frame presentation guard", () => {
  it("fails loudly when repeated blocked outcomes exceed the frame budget", () => {
    withTestRuntime(() => {
      const surface = surfaceHandle();

      for (
        let index = 1;
        index <=
        DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY.maxHeldPreviousFrames;
        index += 1
      ) {
        expect(() =>
          recordGpuFlowBlockedPublicationGuard({
            outcome: blockedOutcome(index, index * 10),
            reducerDecision: reducerDecision(index, index * 10),
            surface,
          }),
        ).not.toThrow();
      }

      const overBudgetFrame =
        DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY.maxHeldPreviousFrames + 1;
      expect(() =>
        recordGpuFlowBlockedPublicationGuard({
          outcome: blockedOutcome(overBudgetFrame, overBudgetFrame * 10),
          reducerDecision: reducerDecision(
            overBudgetFrame,
            overBudgetFrame * 10,
          ),
          surface,
        }),
      ).toThrow(/blocked visible frame presentation exceeded budget/);
    });
  });

  it("clears repeated blocked debt after a non-blocked outcome", () => {
    withTestRuntime(() => {
      const surface = surfaceHandle();
      for (
        let index = 1;
        index <=
        DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY.maxHeldPreviousFrames;
        index += 1
      ) {
        recordGpuFlowBlockedPublicationGuard({
          outcome: blockedOutcome(index, index),
          reducerDecision: reducerDecision(index, index),
          surface,
        });
      }
      recordGpuFlowBlockedPublicationGuard({
        outcome: holdOutcome(100, 100),
        reducerDecision: reducerDecision(100, 100),
        surface,
      });

      expect(() => {
        for (
          let index = 101;
          index <=
          100 +
            DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY.maxHeldPreviousFrames;
          index += 1
        ) {
          recordGpuFlowBlockedPublicationGuard({
            outcome: blockedOutcome(index, index),
            reducerDecision: reducerDecision(index, index),
            surface,
          });
        }
      }).not.toThrow();
    });
  });

  it("rejects blocked guard updates for a different publication sample", () => {
    withTestRuntime(() => {
      expect(() =>
        recordGpuFlowBlockedPublicationGuard({
          outcome: blockedOutcome(1, 10),
          reducerDecision: reducerDecision(2, 20),
          surface: surfaceHandle(),
        }),
      ).toThrow(/blocked token for the selected projection sample/);
    });
  });
});

function blockedOutcome(
  sampleId: number,
  timestamp: number,
): GpuFlowVisibleFrameReducerCompletionOutcome {
  return {
    kind: "blocked",
    token: createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: "held-previous-budget-exceeded",
        },
      ],
      frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
      projectionSample: liveProjectionSample(sampleId, timestamp),
    }),
  };
}

function holdOutcome(
  sampleId: number,
  timestamp: number,
): GpuFlowVisibleFrameReducerCompletionOutcome {
  return {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousTokenForTest({
      committedFrameId: 7,
      holdAgeFrames: 1,
      holdAgeMs: 0,
      projectionSample: liveProjectionSample(sampleId, timestamp),
    }),
  };
}

function reducerDecision(
  sampleId: number,
  timestamp: number,
): GpuFlowVisibleFrameReducerDecision {
  return {
    debt: {
      content: false,
      maintenance: false,
      motion: true,
    },
    lane: "motion",
    rawReasons: ["viewport"],
    sample: liveProjectionSample(sampleId, timestamp),
    reducerState: "motion-active",
  };
}

function liveProjectionSample(
  id: number,
  timestamp: number,
): GpuFlowLiveProjectionSample {
  return {
    cssViewport: {
      height: 600,
      width: 800,
    },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp,
    viewport: [0, 0, 1],
    viewportDelta: {
      x: 0,
      y: 0,
      zoom: 0,
    },
    viewportVelocityCssPxPerMs: {
      x: 0,
      y: 0,
      zoom: 0,
    },
  };
}

function surfaceHandle(): GpuSurfaceHandle {
  return {
    getRuntime: () => null,
    requestFrame: () => undefined,
    requestPaint: () => undefined,
  };
}

function withTestRuntime(run: () => void): void {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  try {
    run();
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
}
