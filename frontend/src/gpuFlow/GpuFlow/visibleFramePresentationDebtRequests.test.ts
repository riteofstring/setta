import { describe, expect, it } from "vitest";

import { createGpuFlowSurfaceReducerDebtFrameRequest } from "./visibleFramePresentationDebtRequests";
import type {
  GpuFlowVisibleFrameReducerCompletion,
  GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";

describe("GPU Flow visible-frame presentation boundary debt requests", () => {
  it("retries active editor content debt as immediate activation work", () => {
    const request = createGpuFlowSurfaceReducerDebtFrameRequest({
      activeEditorActivationPending: true,
      completion: completionWithContentDebt(),
      debtFrameRequest: {
        delayMs: null,
        frameReason: "manual",
      },
      reducerDecision: contentDecision(),
    });

    expect(request).toEqual({
      delayMs: null,
      frameReason: "dom-control-activation",
    });
  });

  it("keeps ordinary content debt on the delayed manual retry path", () => {
    const request = createGpuFlowSurfaceReducerDebtFrameRequest({
      completion: completionWithContentDebt(),
      debtFrameRequest: {
        delayMs: null,
        frameReason: "manual",
      },
      reducerDecision: contentDecision(),
    });

    expect(request).toEqual({
      delayMs: 240,
      frameReason: "manual",
    });
  });
});

function completionWithContentDebt(): GpuFlowVisibleFrameReducerCompletion {
  return {
    debt: {
      content: true,
      maintenance: false,
      motion: false,
    },
    outcome: "hold-previous",
  };
}

function contentDecision(): GpuFlowVisibleFrameReducerDecision {
  return {
    debt: {
      content: true,
      maintenance: false,
      motion: false,
    },
    lane: "content",
    rawReasons: ["manual"],
    sample: { id: 1, timestamp: 1 },
    reducerState: "content-catchup",
  } as unknown as GpuFlowVisibleFrameReducerDecision;
}
