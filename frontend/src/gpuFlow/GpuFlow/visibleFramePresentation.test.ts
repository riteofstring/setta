import { describe, expect, it, vi } from "vitest";

import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { GpuFlowPreparedContentBlockedCandidateResourceWork } from "./visibleFrameContentPlan";
import {
  presentGpuFlowVisibleFramePresentationFrame,
  type GpuFlowVisibleFramePresentationRuntime,
} from "./visibleFramePresentation";
import {
  createGpuFlowVisibleFrameBlockedPresentationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
  createGpuFlowVisibleFramePresentationTokenForTest,
} from "./visibleFrameTestUtils";

type GpuFlowSurfacePresentationTransaction = Parameters<
  typeof presentGpuFlowVisibleFramePresentationFrame
>[0]["presentationTransaction"];

function createTestVisibleFramePresentationBoundary(
  runtime: GpuFlowVisibleFramePresentationRuntime,
): (presentationTransaction: GpuFlowSurfacePresentationTransaction) => void {
  return (presentationTransaction) =>
    presentGpuFlowVisibleFramePresentationFrame({
      ...runtime,
      presentationTransaction,
    });
}

describe("GPU Flow surface presentation completion", () => {
  it("records held-previous diagnostics without advancing presented visible projection state", () => {
    const committedState = visibleProjectionState({
      displayFrameId: 7,
      kind: "prepared-content",
      sampleId: 1,
    });
    const heldState = visibleProjectionState({
      displayFrameId: 7,
      kind: "held-previous",
      sampleId: 2,
    });
    const visibleProjectionStateRef = { current: committedState };
    const visibleProjectionPresentationStateRef = { current: committedState };
    const submitDomTransforms = vi.fn();
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame presentation.");
      },
      projectPresentedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      presentColdStartShellFrame: () => {
        throw new Error(
          "Held-previous presentation must not mutate shell state.",
        );
      },
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef,
      visibleProjectionStateRef,
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    presentationBoundary(
      heldPreviousPresentationTransaction({
        heldState,
        nodeLayerFrameStatePresentation: nodeLayerFrameStatePresentation({
          submitCanvas: () => {
            throw new Error(
              "Held-previous presentation must not submit prepared canvas work.",
            );
          },
          submitDomTransforms,
        }),
        previousContentFrameId:
          committedState.preparedContentFrame.displayFrameId,
      }),
    );

    expect(visibleProjectionStateRef.current).toBe(committedState);
    expect(visibleProjectionPresentationStateRef.current).toBe(committedState);
    expect(submitDomTransforms).not.toHaveBeenCalled();
  });

  it("does not complete reducer debt when committed presentation fails before visibility advances", () => {
    const preparedContentFrame = createPreparedContentFrame({
      displayFrameId: 12,
    });
    const selectedState = visibleProjectionState({
      displayFrameId: preparedContentFrame.displayFrameId,
      kind: "prepared-content",
      sampleId: 12,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrame,
      projectionSample: selectedState.sample,
    });
    let reducerCompletionCount = 0;
    const submitCanvas = vi.fn();
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame presentation.");
      },
      projectPresentedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      presentColdStartShellFrame: () => {
        throw new Error("Unexpected cold-start shell presentation.");
      },
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      validatePreparedContentFrame: () => {
        throw new Error(
          "presentation validation failed before visible frame presentation",
        );
      },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    expect(() =>
      presentationBoundary(
        committedPresentationTransaction({
          preparedContentFrame,
          nodeLayerFrameStatePresentation: nodeLayerFrameStatePresentation({
            submitCanvas,
          }),
          onCompleteSchedulerFrame: () => {
            reducerCompletionCount += 1;
          },
          selectedState,
          token,
        }),
      ),
    ).toThrow(
      /presentation validation failed before visible frame presentation/,
    );
    expect(submitCanvas).not.toHaveBeenCalled();
    expect(reducerCompletionCount).toBe(0);
  });

  it("submits prepared visible work only during visible presentation", () => {
    const preparedContentFrame = createPreparedContentFrame({
      displayFrameId: 21,
    });
    const selectedState = visibleProjectionState({
      displayFrameId: preparedContentFrame.displayFrameId,
      kind: "prepared-content",
      sampleId: 21,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrame,
      projectionSample: selectedState.sample,
    });
    const visibleMutationOrder: string[] = [];
    const submitCanvas = vi.fn(() => {
      visibleMutationOrder.push("canvas");
    });
    const submitDomTransforms = vi.fn(() => {
      visibleMutationOrder.push("dom-transform");
    });
    const presentColdStartShellFrame = vi.fn();
    const validatePreparedContentFrame = vi.fn(() => {
      visibleMutationOrder.push("validate");
    });
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: {
        current: {
          framePerformanceReporter: undefined,
          onNodeLayerFrame: () => {},
        },
      },
      presentPreparedContentFrame: () => {
        visibleMutationOrder.push("present");
        return true;
      },
      projectPresentedBrowserVisualActors: () => {},
      presentColdStartShellFrame,
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      validatePreparedContentFrame,
      viewportRuntime: {
        applyOverlayTransforms: () => {},
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    presentationBoundary(
      committedPresentationTransaction({
        preparedContentFrame,
        nodeLayerFrameStatePresentation: nodeLayerFrameStatePresentation({
          submitCanvas,
          submitDomTransforms,
        }),
        onCompleteSchedulerFrame: () => {},
        selectedState,
        token,
      }),
    );

    expect(submitCanvas).toHaveBeenCalledOnce();
    expect(submitDomTransforms).toHaveBeenCalledOnce();
    expect(validatePreparedContentFrame).toHaveBeenCalledOnce();
    expect(visibleMutationOrder.slice(0, 4)).toEqual([
      "validate",
      "canvas",
      "dom-transform",
      "present",
    ]);
    expect(presentColdStartShellFrame).toHaveBeenCalledWith({
      frame: null,
      token,
    });
  });

  it("does not promote committed state when prepared canvas submission fails", () => {
    const preparedContentFrame = createPreparedContentFrame({
      displayFrameId: 22,
    });
    const selectedState = visibleProjectionState({
      displayFrameId: preparedContentFrame.displayFrameId,
      kind: "prepared-content",
      sampleId: 22,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrame,
      projectionSample: selectedState.sample,
    });
    const presentPreparedContentFrame = vi.fn(() => true);
    const projectPresentedBrowserVisualActors = vi.fn();
    const validatePreparedContentFrame = vi.fn();
    let reducerCompletionCount = 0;
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: {
        current: {
          framePerformanceReporter: undefined,
          onNodeLayerFrame: () => {},
        },
      },
      presentPreparedContentFrame,
      projectPresentedBrowserVisualActors,
      presentColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      validatePreparedContentFrame,
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    expect(() =>
      presentationBoundary(
        committedPresentationTransaction({
          preparedContentFrame,
          nodeLayerFrameStatePresentation: nodeLayerFrameStatePresentation({
            submitCanvas: () => {
              throw new Error("canvas submission failed");
            },
          }),
          onCompleteSchedulerFrame: () => {
            reducerCompletionCount += 1;
          },
          selectedState,
          token,
        }),
      ),
    ).toThrow(/canvas submission failed/);
    expect(validatePreparedContentFrame).toHaveBeenCalledOnce();
    expect(presentPreparedContentFrame).not.toHaveBeenCalled();
    expect(projectPresentedBrowserVisualActors).not.toHaveBeenCalled();
    expect(reducerCompletionCount).toBe(0);
  });

  it("lets reducer debt own duplicate retained follow-up frame requests", () => {
    const preparedContentFrame = createPreparedContentFrame({
      displayFrameId: 31,
    });
    const selectedState = visibleProjectionState({
      displayFrameId: preparedContentFrame.displayFrameId,
      kind: "prepared-content",
      sampleId: 31,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrame,
      projectionSample: selectedState.sample,
    });
    const requestFrame = vi.fn();
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => true,
      projectPresentedBrowserVisualActors: () => {},
      presentColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: { requestFrame } },
      validatePreparedContentFrame: () => {},
      viewportRuntime: {
        applyOverlayTransforms: () => {},
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    presentationBoundary(
      committedPresentationTransaction({
        preparedContentFrame,
        debtFrameRequest: {
          delayMs: null,
          frameReason: "texture-upload",
        },
        followUpFrameRequests: ["texture-upload"],
        onCompleteSchedulerFrame: () => {},
        selectedState,
        token,
      }),
    );

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
  });

  it("defers unresolved content debt instead of immediately looping repair frames", () => {
    const preparedContentFrame = createPreparedContentFrame({
      displayFrameId: 41,
    });
    const selectedState = visibleProjectionState({
      displayFrameId: preparedContentFrame.displayFrameId,
      kind: "prepared-content",
      sampleId: 41,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrame,
      projectionSample: selectedState.sample,
    });
    const requestFrame = vi.fn();
    const setTimeout = vi.fn(() => 1);
    const clearTimeout = vi.fn();
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => true,
      projectPresentedBrowserVisualActors: () => {},
      presentColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: {
        current: {
          getRuntime: () => ({
            canvas: {
              ownerDocument: {
                defaultView: {
                  clearTimeout,
                  setTimeout,
                },
              },
            },
          }),
          requestFrame,
        },
      },
      validatePreparedContentFrame: () => {},
      viewportRuntime: {
        applyOverlayTransforms: () => {},
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    presentationBoundary(
      committedPresentationTransaction({
        preparedContentFrame,
        debtFrameRequest: {
          delayMs: null,
          frameReason: "manual",
        },
        onCompleteSchedulerFrame: () => {},
        reducerCompletion: {
          debt: {
            content: true,
            maintenance: false,
            motion: false,
          },
          outcome: "blocked",
        },
        selectedState,
        token,
      }),
    );

    expect(requestFrame).not.toHaveBeenCalled();
    expect(setTimeout).toHaveBeenCalledOnce();
  });

  it("keeps the earliest delayed retry when repeated frames request the same debt reason", () => {
    const firstPreparedContentFrame = createPreparedContentFrame({
      displayFrameId: 42,
    });
    const firstSelectedState = visibleProjectionState({
      displayFrameId: firstPreparedContentFrame.displayFrameId,
      kind: "prepared-content",
      sampleId: 42,
    });
    const firstToken = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: firstPreparedContentFrame,
      projectionSample: firstSelectedState.sample,
    });
    const secondPreparedContentFrame = createPreparedContentFrame({
      displayFrameId: 43,
    });
    const secondSelectedState = visibleProjectionState({
      displayFrameId: secondPreparedContentFrame.displayFrameId,
      kind: "prepared-content",
      sampleId: 43,
    });
    const secondToken = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: secondPreparedContentFrame,
      projectionSample: secondSelectedState.sample,
    });
    const requestFrame = vi.fn();
    const setTimeout = vi.fn(() => 1);
    const clearTimeout = vi.fn();
    const surface = {
      getRuntime: () => ({
        canvas: {
          ownerDocument: {
            defaultView: {
              clearTimeout,
              setTimeout,
            },
          },
        },
      }),
      requestFrame,
    };
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => true,
      projectPresentedBrowserVisualActors: () => {},
      presentColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: {
        current: surface,
      },
      validatePreparedContentFrame: () => {},
      viewportRuntime: {
        applyOverlayTransforms: () => {},
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);
    const reducerCompletion = {
      debt: {
        content: true,
        maintenance: false,
        motion: false,
      },
      outcome: "present",
    };

    presentationBoundary(
      committedPresentationTransaction({
        preparedContentFrame: firstPreparedContentFrame,
        debtFrameRequest: {
          delayMs: 160,
          frameReason: "manual",
        },
        onCompleteSchedulerFrame: () => {},
        reducerCompletion,
        selectedState: firstSelectedState,
        token: firstToken,
      }),
    );
    presentationBoundary(
      committedPresentationTransaction({
        preparedContentFrame: secondPreparedContentFrame,
        debtFrameRequest: {
          delayMs: 160,
          frameReason: "manual",
        },
        onCompleteSchedulerFrame: () => {},
        reducerCompletion,
        selectedState: secondSelectedState,
        token: secondToken,
      }),
    );

    expect(setTimeout).toHaveBeenCalledOnce();
    expect(clearTimeout).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("requests texture upload debt immediately while content preparation is blocked", () => {
    const blockedFrame = createPreparedContentFrame({ displayFrameId: 51 });
    const sample = liveProjectionSample({
      id: 51,
      timestamp: 51,
    });
    const token = createGpuFlowVisibleFrameBlockedPresentationTokenForTest({
      blockedReasons: [
        {
          actorId: "retained-dom-control:a",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: blockedFrame.displayFrameId,
      projectionSample: sample,
    });
    const requestFrame = vi.fn();
    let delayedContentRetry: (() => void) | null = null;
    const setTimeout = vi.fn((callback: () => void) => {
      delayedContentRetry = callback;
      return 1;
    });
    const clearTimeout = vi.fn();
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {},
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame presentation.");
      },
      projectPresentedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      presentColdStartShellFrame: () => {
        throw new Error("Blocked presentation must not mutate shell state.");
      },
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: {
        current: {
          getRuntime: () => ({
            canvas: {
              ownerDocument: {
                defaultView: {
                  clearTimeout,
                  setTimeout,
                },
              },
            },
          }),
          requestFrame,
        },
      },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    presentationBoundary(
      blockedPresentationTransaction({
        blockedFrame,
        debtFrameRequest: {
          delayMs: null,
          frameReason: "texture-upload",
        },
        sample,
        reducerCompletion: {
          debt: {
            content: true,
            maintenance: true,
            motion: true,
          },
          outcome: "blocked",
        },
        token,
      }),
    );

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
    expect(setTimeout).toHaveBeenCalledOnce();
    (delayedContentRetry as (() => void) | null)?.();
    expect(requestFrame).toHaveBeenLastCalledWith("manual");
  });

  it("stages and wakes budget-selected browser visual resources while blocked", () => {
    const blockedFrame = createPreparedContentFrame({ displayFrameId: 61 });
    const sample = liveProjectionSample({
      id: 61,
      timestamp: 61,
    });
    const token = createGpuFlowVisibleFrameBlockedPresentationTokenForTest({
      blockedReasons: [],
      frozenFrameId: blockedFrame.displayFrameId,
      projectionSample: sample,
    });
    const requestFrame = vi.fn();
    const abortPreparedContentFrame = vi.fn();
    const selectedResourceKeys = ["dom-control:retained-dom-control:a"];
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame,
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame presentation.");
      },
      projectPresentedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      presentColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: {
        current: {
          requestFrame,
        },
      },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    presentationBoundary(
      blockedPresentationTransaction({
        blockedFrame,
        blockedPreservePreparationSnapshot: true,
        debtFrameRequest: null,
        presentationFrameContext: presentationFrameContextForTest({
          selectedResourceDebtIds: selectedResourceKeys,
        }),
        sample,
        reducerCompletion: {
          debt: {
            content: true,
            maintenance: false,
            motion: false,
          },
          outcome: "blocked",
        },
        token,
      }),
    );

    expect(abortPreparedContentFrame).toHaveBeenCalledWith(
      token,
      blockedFrame,
      {
        browserVisualPreparationResourceKeys: selectedResourceKeys,
        preservePreparationSnapshot: true,
      },
    );
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
  });

  it("stages raw browser visual repair resources for blocked proofs without a budget subset", () => {
    const blockedFrame = createPreparedContentFrame({ displayFrameId: 62 });
    const sample = liveProjectionSample({
      id: 62,
      timestamp: 62,
    });
    const token = createGpuFlowVisibleFrameBlockedPresentationTokenForTest({
      blockedReasons: [
        {
          actorId: null,
          family: "browser-visual",
          reason: "live-dom-budget",
        },
      ],
      frozenFrameId: blockedFrame.displayFrameId,
      projectionSample: sample,
    });
    const requestFrame = vi.fn();
    const abortPreparedContentFrame = vi.fn();
    const resourceWork = browserVisualResourceWork([
      "browser-visual:visible-a:browser-text-control:live-dom-budget:generation-a",
      "browser-visual:new-a:browser-text-control:live-dom-budget:generation-b",
    ]);
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame,
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame presentation.");
      },
      projectPresentedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      presentColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: {
        current: {
          requestFrame,
        },
      },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    presentationBoundary(
      blockedPresentationTransaction({
        blockedFrame,
        blockedPreservePreparationSnapshot: true,
        blockedResourceWork: resourceWork,
        debtFrameRequest: null,
        sample,
        reducerCompletion: {
          debt: {
            content: true,
            maintenance: false,
            motion: false,
          },
          outcome: "blocked",
        },
        token,
      }),
    );

    expect(abortPreparedContentFrame).toHaveBeenCalledWith(
      token,
      blockedFrame,
      {
        browserVisualPreparationResourceKeys: resourceWork.workItems.map(
          (item) => item.candidateResourceKey,
        ),
        preservePreparationSnapshot: true,
      },
    );
  });
});

function heldPreviousPresentationTransaction({
  heldState,
  nodeLayerFrameStatePresentation = null,
  previousContentFrameId,
}: {
  readonly heldState: GpuFlowVisibleProjectionState;
  readonly nodeLayerFrameStatePresentation?: unknown;
  readonly previousContentFrameId: number;
}): GpuFlowSurfacePresentationTransaction {
  return {
    coldStartShellPresentation: null,
    completeReducerFrame: () => ({
      completion: {
        debt: {
          content: false,
          motion: false,
        },
        outcome: "held-previous",
      },
      debtFrameRequest: null,
    }),
    followUpFrameRequests: [],
    heldPreviousVisibleProjectionState: null,
    outcome: {
      kind: "hold-previous",
      token: createGpuFlowVisibleFrameHoldPreviousTokenForTest({
        preparedContentFrameId: previousContentFrameId,
        holdAgeFrames: 1,
        holdAgeMs: 16,
        projectionSample: heldState.sample,
      }),
    },
    preparedFrame: {
      contentPreparationFrame: {
        blockedErrorMessage: null,
        blockedPreparedContentFrame: null,
        blockedPreservePreparationSnapshot: false,
        preparedContentFrame: null,
        heldPreparedContentFrame: null,
        nodeLayerFrameStatePresentation: null,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePresentation,
      },
      transactionProof: null,
      visibleProjectionState: heldState,
    },
    previousContentFrameId,
    presentationFrameContext: presentationFrameContextForTest(),
    reducerDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample: heldState.sample,
    },
  } as unknown as GpuFlowSurfacePresentationTransaction;
}

function committedPresentationTransaction({
  preparedContentFrame,
  debtFrameRequest = null,
  followUpFrameRequests = [],
  nodeLayerFrameStatePresentation = null,
  onCompleteSchedulerFrame,
  reducerCompletion = {
    debt: {
      content: false,
      maintenance: false,
      motion: false,
    },
    outcome: "present",
  },
  selectedState,
  token,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly debtFrameRequest?: unknown;
  readonly followUpFrameRequests?: readonly string[];
  readonly nodeLayerFrameStatePresentation?: unknown;
  readonly onCompleteSchedulerFrame: () => void;
  readonly reducerCompletion?: unknown;
  readonly selectedState: GpuFlowVisibleProjectionState;
  readonly token: ReturnType<
    typeof createGpuFlowVisibleFramePresentationTokenForTest
  >;
}): GpuFlowSurfacePresentationTransaction {
  return {
    coldStartShellPresentation: {
      frame: null,
      token,
    },
    completeReducerFrame: () => {
      onCompleteSchedulerFrame();
      return {
        completion: reducerCompletion,
        debtFrameRequest,
      };
    },
    followUpFrameRequests,
    heldPreviousVisibleProjectionState: null,
    outcome: {
      debtProof: {
        content: true,
        maintenance: false,
        motion: false,
      },
      kind: "present",
      token,
    },
    preparedFrame: {
      contentPreparationFrame: {
        blockedErrorMessage: null,
        blockedPreparedContentFrame: null,
        blockedPreservePreparationSnapshot: false,
        preparedContentFrame: preparedContentFrame,
        heldPreparedContentFrame: null,
        nodeLayerFrameStatePresentation,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePresentation: null,
      },
      transactionProof: null,
      visibleProjectionState: selectedState,
    },
    previousContentFrameId: null,
    presentationFrameContext: presentationFrameContextForTest(),
    reducerDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample: selectedState.sample,
      reducerState: "content-catchup",
    },
  } as unknown as GpuFlowSurfacePresentationTransaction;
}

function nodeLayerFrameStatePresentation({
  submitCanvas,
  submitDomTransforms,
}: {
  readonly submitCanvas: () => void;
  readonly submitDomTransforms?: (() => void) | undefined;
}) {
  return {
    callbacksRef: {
      current: {
        framePerformanceReporter: undefined,
        onNodeLayerFrame: () => {},
      },
    },
    layerResult: {
      budgetExhausted: false,
      canvasSubmission: { submit: submitCanvas },
      domTransformSubmission: submitDomTransforms
        ? { submit: submitDomTransforms }
        : null,
      domTransformParkedNodeIds: [],
      domTransformUpdatedNodeIds: [],
      visibleNodeIds: [],
      visualScene: {
        effectSurfaces: [],
        flatSurfaces: [],
        lateFlatSurfaces: [],
        meshSurfaces: [],
        solidRoundedRectSurfaces: [],
        tiledFlatSurfaces: [],
      },
    },
    nodeInteractionRef: { current: null },
    nodeLayerRef: { current: {} },
    retainedRuntimeFrame: {},
    retainedTexturePageFollowUpFrame: false,
    surfaceRef: { current: null },
    switchAnimationFollowUpFrame: false,
    transformOnlyPaintNodeIdsRef: { current: new Set() },
    viewport: [0, 0, 1],
    viewportFrame: false,
    visibleNodeIdsRef: { current: new Set() },
  };
}

function browserVisualResourceWork(
  candidateResourceKeys: readonly string[],
): GpuFlowPreparedContentBlockedCandidateResourceWork {
  return {
    deferWakeup: false,
    timestamp: 62,
    workItems: candidateResourceKeys.map((candidateResourceKey, index) => ({
      actorId: `actor-${index}`,
      blockedReason: "live-dom-budget",
      candidateResourceKey,
      clipRect: null,
      debtAgeFrames: 0,
      lastReadyResourceKey: null,
      ownerFrameId: 62,
      readinessState: "requested" as const,
      representationKind: "blocked-awaiting-live-host",
      sourceHostIdentity: `actor-${index}`,
      sourceRect: null,
      wakeupSource: "blocked-presentation" as const,
    })),
  };
}

function blockedPresentationTransaction({
  blockedFrame,
  blockedPreservePreparationSnapshot = false,
  blockedResourceWork = null,
  debtFrameRequest,
  presentationFrameContext = presentationFrameContextForTest(),
  sample,
  reducerCompletion,
  token,
}: {
  readonly blockedFrame: GpuFlowPreparedContentFrame;
  readonly blockedPreservePreparationSnapshot?: boolean | undefined;
  readonly blockedResourceWork?:
    | GpuFlowPreparedContentBlockedCandidateResourceWork
    | null
    | undefined;
  readonly debtFrameRequest: unknown;
  readonly presentationFrameContext?: unknown;
  readonly sample: GpuFlowLiveProjectionSample;
  readonly reducerCompletion: unknown;
  readonly token: ReturnType<
    typeof createGpuFlowVisibleFrameBlockedPresentationTokenForTest
  >;
}): GpuFlowSurfacePresentationTransaction {
  return {
    coldStartShellPresentation: null,
    completeReducerFrame: () => ({
      completion: reducerCompletion,
      debtFrameRequest,
    }),
    followUpFrameRequests: [],
    heldPreviousVisibleProjectionState: null,
    outcome: {
      kind: "blocked",
      token,
    },
    preparedFrame: {
      contentPreparationFrame: {
        blockedErrorMessage: null,
        blockedPreparedContentFrame: blockedFrame,
        blockedPreparedContentFrameResourceWork: blockedResourceWork,
        blockedPreservePreparationSnapshot,
        preparedContentFrame: null,
        heldPreparedContentFrame: null,
        nodeLayerFrameStatePresentation: null,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePresentation: null,
      },
      transactionProof: null,
      visibleProjectionState: null,
    },
    previousContentFrameId: null,
    presentationFrameContext,
    reducerDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample,
      reducerState: "content-catchup",
    },
  } as unknown as GpuFlowSurfacePresentationTransaction;
}

function presentationFrameContextForTest({
  activeEditorPins = [],
  selectedResourceDebtIds = [],
}: {
  readonly activeEditorPins?: readonly string[] | undefined;
  readonly selectedResourceDebtIds?: readonly string[] | undefined;
} = {}) {
  return {
    activeEditorPins,
    budgetDecision: {
      preparationBudget: {
        selectedResourceDebtIds,
      },
    },
  };
}

function visibleProjectionState({
  displayFrameId,
  kind,
  sampleId,
}: {
  readonly displayFrameId: number;
  readonly kind: "prepared-content" | "held-previous";
  readonly sampleId: number;
}): GpuFlowVisibleProjectionState {
  return {
    preparedContentFrame: createPreparedContentFrame({ displayFrameId }),
    debugState: {
      preparedContentFrameId: displayFrameId,
      gestureOwner: "idle",
      heldPreviousDurationMs: 0,
      heldPreviousFrameCount: 0,
      heldPreviousOverBudget: false,
      heldPreviousReason: null,
      heldPreviousRequestedSampleId: null,
      lane: "content",
      projectionSampleId: sampleId,
      projectionTransactionId: `projection:${displayFrameId}:${sampleId}`,
      transactionKind: kind,
    },
    sample: liveProjectionSample({
      id: sampleId,
      timestamp: sampleId * 16,
    }),
    transaction: {
      id: `projection:${displayFrameId}:${sampleId}`,
      kind,
      lane: "content",
    },
  } as GpuFlowVisibleProjectionState;
}

function createPreparedContentFrame({
  displayFrameId,
}: {
  readonly displayFrameId: number;
}): GpuFlowPreparedContentFrame {
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlPreparedFrameId: displayFrameId,
    domIslandPreparedFrameId: displayFrameId,
    gpuNativeVisualPreparedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayPreparedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowPreparedContentPresentationProof({
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      obligations: {
        visibleActorIds: [],
      },
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    presentability: {
      blockingActorIds: [],
      kind: "presentable",
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowPreparedContentFrame;
}

function testCanvas(): HTMLCanvasElement {
  return {
    closest: () => null,
    dataset: {},
  } as unknown as HTMLCanvasElement;
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return {
    id,
    retainedScrollOffsets: new Map(),
    timestamp,
    viewport: [0, 0, 1],
  } as unknown as GpuFlowLiveProjectionSample;
}
