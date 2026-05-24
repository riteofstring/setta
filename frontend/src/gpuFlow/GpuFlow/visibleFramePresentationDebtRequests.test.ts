import { describe, expect, it } from "vitest";

import { createGpuFlowSurfacePublicationDebtFrameRequest } from "./visibleFramePresentationDebtRequests";
import type {
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDecision,
} from "./visibleFrameReducerRuntime";

describe("GPU Flow visible-frame presentation boundary debt requests", () => {
  it("retries active editor content debt as immediate activation work", () => {
    const request = createGpuFlowSurfacePublicationDebtFrameRequest({
      activeEditorActivationPending: true,
      completion: completionWithContentDebt(),
      debtFrameRequest: {
        delayMs: null,
        frameReason: "manual",
      },
      publicationDecision: contentDecision(),
    });

    expect(request).toEqual({
      delayMs: null,
      frameReason: "dom-control-activation",
    });
  });

  it("keeps ordinary content debt on the delayed manual retry path", () => {
    const request = createGpuFlowSurfacePublicationDebtFrameRequest({
      completion: completionWithContentDebt(),
      debtFrameRequest: {
        delayMs: null,
        frameReason: "manual",
      },
      publicationDecision: contentDecision(),
    });

    expect(request).toEqual({
      delayMs: 240,
      frameReason: "manual",
    });
  });
});

function completionWithContentDebt(): GpuFlowVisiblePublicationCompletion {
  return {
    debt: {
      content: true,
      maintenance: false,
      motion: false,
    },
    outcome: "hold-previous",
  };
}

function contentDecision(): GpuFlowVisiblePublicationDecision {
  return {
    debt: {
      content: true,
      maintenance: false,
      motion: false,
    },
    lane: "content",
    rawReasons: ["manual"],
    sample: { id: 1, timestamp: 1 },
    schedulerState: "content-catchup",
  } as unknown as GpuFlowVisiblePublicationDecision;
}
