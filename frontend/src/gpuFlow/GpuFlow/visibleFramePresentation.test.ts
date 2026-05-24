import { describe, expect, it, vi } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { GpuFlowCommittedSurfaceBlockedCandidateResourceWork } from "./visibleFrameContentPlan";
import {
  presentGpuFlowVisibleFramePublicationFrame,
  type GpuFlowVisibleFramePresentationRuntime,
} from "./visibleFramePresentation";
import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
  createGpuFlowVisibleFramePresentationTokenForTest,
} from "./visibleFrameTestUtils";

type GpuFlowSurfacePublicationTransaction = Parameters<
  typeof presentGpuFlowVisibleFramePublicationFrame
>[0]["publicationTransaction"];

function createTestVisibleFramePresentation(
  runtime: GpuFlowVisibleFramePresentationRuntime,
): (publicationTransaction: GpuFlowSurfacePublicationTransaction) => void {
  return (publicationTransaction) =>
    presentGpuFlowVisibleFramePublicationFrame({
      ...runtime,
      publicationTransaction,
    });
}

describe("GPU Flow surface publication completion", () => {
  it("records held-previous diagnostics without advancing presented visible projection state", () => {
    const committedState = visibleProjectionState({
      displayFrameId: 7,
      kind: "content-publication",
      sampleId: 1,
    });
    const heldState = visibleProjectionState({
      displayFrameId: 7,
      kind: "held-previous",
      sampleId: 2,
    });
    const visibleProjectionStateRef = { current: committedState };
    const visibleProjectionPublicationStateRef = { current: committedState };
    const submitDomTransforms = vi.fn();
    const presenter = createTestVisibleFramePresentation({
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
      publishColdStartShellFrame: () => {
        throw new Error(
          "Held-previous publication must not mutate shell state.",
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
      visibleProjectionPublicationStateRef,
      visibleProjectionStateRef,
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    presenter(
      heldPreviousPublicationTransaction({
        heldState,
        nodeLayerFrameStatePublication: nodeLayerFrameStatePublication({
          submitCanvas: () => {
            throw new Error(
              "Held-previous publication must not submit prepared canvas work.",
            );
          },
          submitDomTransforms,
        }),
        previousContentFrameId: committedState.committedFrame.displayFrameId,
      }),
    );

    expect(visibleProjectionStateRef.current).toBe(committedState);
    expect(visibleProjectionPublicationStateRef.current).toBe(committedState);
    expect(submitDomTransforms).not.toHaveBeenCalled();
  });

  it("does not complete reducer debt when committed publication fails before visibility advances", () => {
    const committedFrame = preparedContentFrame({ displayFrameId: 12 });
    const selectedState = visibleProjectionState({
      displayFrameId: committedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 12,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: committedFrame,
      projectionSample: selectedState.sample,
    });
    let reducerCompletionCount = 0;
    const submitCanvas = vi.fn();
    const presenter = createTestVisibleFramePresentation({
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
      publishColdStartShellFrame: () => {
        throw new Error("Unexpected cold-start shell publication.");
      },
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      validatePreparedContentFrame: () => {
        throw new Error(
          "presentation validation failed before visible publication",
        );
      },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    expect(() =>
      presenter(
        committedPublicationTransaction({
          committedFrame,
          nodeLayerFrameStatePublication: nodeLayerFrameStatePublication({
            submitCanvas,
          }),
          onCompleteSchedulerFrame: () => {
            reducerCompletionCount += 1;
          },
          selectedState,
          token,
        }),
      ),
    ).toThrow(/presentation validation failed before visible publication/);
    expect(submitCanvas).not.toHaveBeenCalled();
    expect(reducerCompletionCount).toBe(0);
  });

  it("submits prepared visible work only during visible presentation", () => {
    const committedFrame = preparedContentFrame({ displayFrameId: 21 });
    const selectedState = visibleProjectionState({
      displayFrameId: committedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 21,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: committedFrame,
      projectionSample: selectedState.sample,
    });
    const visibleMutationOrder: string[] = [];
    const submitCanvas = vi.fn(() => {
      visibleMutationOrder.push("canvas");
    });
    const submitDomTransforms = vi.fn(() => {
      visibleMutationOrder.push("dom-transform");
    });
    const publishColdStartShellFrame = vi.fn();
    const validatePreparedContentFrame = vi.fn(() => {
      visibleMutationOrder.push("validate");
    });
    const presenter = createTestVisibleFramePresentation({
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
      publishColdStartShellFrame,
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
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    presenter(
      committedPublicationTransaction({
        committedFrame,
        nodeLayerFrameStatePublication: nodeLayerFrameStatePublication({
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
    expect(publishColdStartShellFrame).toHaveBeenCalledWith({
      frame: null,
      token,
    });
  });

  it("does not promote committed state when prepared canvas submission fails", () => {
    const committedFrame = preparedContentFrame({ displayFrameId: 22 });
    const selectedState = visibleProjectionState({
      displayFrameId: committedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 22,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: committedFrame,
      projectionSample: selectedState.sample,
    });
    const presentPreparedContentFrame = vi.fn(() => true);
    const projectPresentedBrowserVisualActors = vi.fn();
    const validatePreparedContentFrame = vi.fn();
    let reducerCompletionCount = 0;
    const presenter = createTestVisibleFramePresentation({
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
      publishColdStartShellFrame: () => {},
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
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    expect(() =>
      presenter(
        committedPublicationTransaction({
          committedFrame,
          nodeLayerFrameStatePublication: nodeLayerFrameStatePublication({
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
    const committedFrame = preparedContentFrame({ displayFrameId: 31 });
    const selectedState = visibleProjectionState({
      displayFrameId: committedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 31,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: committedFrame,
      projectionSample: selectedState.sample,
    });
    const requestFrame = vi.fn();
    const presenter = createTestVisibleFramePresentation({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => true,
      projectPresentedBrowserVisualActors: () => {},
      publishColdStartShellFrame: () => {},
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
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    presenter(
      committedPublicationTransaction({
        committedFrame,
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
    const committedFrame = preparedContentFrame({ displayFrameId: 41 });
    const selectedState = visibleProjectionState({
      displayFrameId: committedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 41,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: committedFrame,
      projectionSample: selectedState.sample,
    });
    const requestFrame = vi.fn();
    const setTimeout = vi.fn(() => 1);
    const clearTimeout = vi.fn();
    const presenter = createTestVisibleFramePresentation({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => true,
      projectPresentedBrowserVisualActors: () => {},
      publishColdStartShellFrame: () => {},
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
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    presenter(
      committedPublicationTransaction({
        committedFrame,
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
    const firstCommittedFrame = preparedContentFrame({ displayFrameId: 42 });
    const firstSelectedState = visibleProjectionState({
      displayFrameId: firstCommittedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 42,
    });
    const firstToken = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: firstCommittedFrame,
      projectionSample: firstSelectedState.sample,
    });
    const secondCommittedFrame = preparedContentFrame({ displayFrameId: 43 });
    const secondSelectedState = visibleProjectionState({
      displayFrameId: secondCommittedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 43,
    });
    const secondToken = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: secondCommittedFrame,
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
    const presenter = createTestVisibleFramePresentation({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => true,
      projectPresentedBrowserVisualActors: () => {},
      publishColdStartShellFrame: () => {},
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
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);
    const reducerCompletion = {
      debt: {
        content: true,
        maintenance: false,
        motion: false,
      },
      outcome: "present",
    };

    presenter(
      committedPublicationTransaction({
        committedFrame: firstCommittedFrame,
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
    presenter(
      committedPublicationTransaction({
        committedFrame: secondCommittedFrame,
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

  it("requests texture upload debt immediately while content publication is blocked", () => {
    const blockedFrame = preparedContentFrame({ displayFrameId: 51 });
    const sample = liveProjectionSample({
      id: 51,
      timestamp: 51,
    });
    const token = createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
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
    const presenter = createTestVisibleFramePresentation({
      abortPreparedContentFrame: () => {},
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame presentation.");
      },
      projectPresentedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      publishColdStartShellFrame: () => {
        throw new Error("Blocked publication must not mutate shell state.");
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
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    presenter(
      blockedPublicationTransaction({
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
    const blockedFrame = preparedContentFrame({ displayFrameId: 61 });
    const sample = liveProjectionSample({
      id: 61,
      timestamp: 61,
    });
    const token = createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
      blockedReasons: [],
      frozenFrameId: blockedFrame.displayFrameId,
      projectionSample: sample,
    });
    const requestFrame = vi.fn();
    const abortPreparedContentFrame = vi.fn();
    const selectedResourceKeys = ["dom-control:retained-dom-control:a"];
    const presenter = createTestVisibleFramePresentation({
      abortPreparedContentFrame,
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame presentation.");
      },
      projectPresentedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      publishColdStartShellFrame: () => {},
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
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    presenter(
      blockedPublicationTransaction({
        blockedFrame,
        blockedPreservePreparationSnapshot: true,
        debtFrameRequest: null,
        publicationFrameContext: publicationFrameContextForTest({
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
    const blockedFrame = preparedContentFrame({ displayFrameId: 62 });
    const sample = liveProjectionSample({
      id: 62,
      timestamp: 62,
    });
    const token = createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
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
    const presenter = createTestVisibleFramePresentation({
      abortPreparedContentFrame,
      callbacksRef: { current: null },
      presentPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame presentation.");
      },
      projectPresentedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      publishColdStartShellFrame: () => {},
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
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createTestVisibleFramePresentation>[0]);

    presenter(
      blockedPublicationTransaction({
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

function heldPreviousPublicationTransaction({
  heldState,
  nodeLayerFrameStatePublication = null,
  previousContentFrameId,
}: {
  readonly heldState: GpuFlowVisibleProjectionState;
  readonly nodeLayerFrameStatePublication?: unknown;
  readonly previousContentFrameId: number;
}): GpuFlowSurfacePublicationTransaction {
  return {
    coldStartShellPublication: null,
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
        committedFrameId: previousContentFrameId,
        holdAgeFrames: 1,
        holdAgeMs: 16,
        projectionSample: heldState.sample,
      }),
    },
    preparedFrame: {
      contentPublicationFrame: {
        blockedErrorMessage: null,
        blockedPreparedContentFrame: null,
        blockedPreservePreparationSnapshot: false,
        preparedContentFrame: null,
        heldPreparedContentFrame: null,
        nodeLayerFrameStatePublication: null,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication,
      },
      transactionProof: null,
      visibleProjectionState: heldState,
    },
    previousContentFrameId,
    publicationFrameContext: publicationFrameContextForTest(),
    publicationDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample: heldState.sample,
    },
  } as unknown as GpuFlowSurfacePublicationTransaction;
}

function committedPublicationTransaction({
  committedFrame,
  debtFrameRequest = null,
  followUpFrameRequests = [],
  nodeLayerFrameStatePublication = null,
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
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly debtFrameRequest?: unknown;
  readonly followUpFrameRequests?: readonly string[];
  readonly nodeLayerFrameStatePublication?: unknown;
  readonly onCompleteSchedulerFrame: () => void;
  readonly reducerCompletion?: unknown;
  readonly selectedState: GpuFlowVisibleProjectionState;
  readonly token: ReturnType<
    typeof createGpuFlowVisibleFramePresentationTokenForTest
  >;
}): GpuFlowSurfacePublicationTransaction {
  return {
    coldStartShellPublication: {
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
      contentPublicationFrame: {
        blockedErrorMessage: null,
        blockedPreparedContentFrame: null,
        blockedPreservePreparationSnapshot: false,
        preparedContentFrame: committedFrame,
        heldPreparedContentFrame: null,
        nodeLayerFrameStatePublication,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: null,
      },
      transactionProof: null,
      visibleProjectionState: selectedState,
    },
    previousContentFrameId: null,
    publicationFrameContext: publicationFrameContextForTest(),
    publicationDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample: selectedState.sample,
      schedulerState: "content-catchup",
    },
  } as unknown as GpuFlowSurfacePublicationTransaction;
}

function nodeLayerFrameStatePublication({
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
): GpuFlowCommittedSurfaceBlockedCandidateResourceWork {
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
      wakeupSource: "blocked-publication" as const,
    })),
  };
}

function blockedPublicationTransaction({
  blockedFrame,
  blockedPreservePreparationSnapshot = false,
  blockedResourceWork = null,
  debtFrameRequest,
  publicationFrameContext = publicationFrameContextForTest(),
  sample,
  reducerCompletion,
  token,
}: {
  readonly blockedFrame: GpuFlowCommittedSurfaceFrame;
  readonly blockedPreservePreparationSnapshot?: boolean | undefined;
  readonly blockedResourceWork?:
    | GpuFlowCommittedSurfaceBlockedCandidateResourceWork
    | null
    | undefined;
  readonly debtFrameRequest: unknown;
  readonly publicationFrameContext?: unknown;
  readonly sample: GpuFlowLiveProjectionSample;
  readonly reducerCompletion: unknown;
  readonly token: ReturnType<
    typeof createGpuFlowVisibleFrameBlockedPublicationTokenForTest
  >;
}): GpuFlowSurfacePublicationTransaction {
  return {
    coldStartShellPublication: null,
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
      contentPublicationFrame: {
        blockedErrorMessage: null,
        blockedPreparedContentFrame: blockedFrame,
        blockedPreparedContentFrameResourceWork: blockedResourceWork,
        blockedPreservePreparationSnapshot,
        preparedContentFrame: null,
        heldPreparedContentFrame: null,
        nodeLayerFrameStatePublication: null,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: null,
      },
      transactionProof: null,
      visibleProjectionState: null,
    },
    previousContentFrameId: null,
    publicationFrameContext,
    publicationDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample,
      schedulerState: "content-catchup",
    },
  } as unknown as GpuFlowSurfacePublicationTransaction;
}

function publicationFrameContextForTest({
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
  readonly kind: "content-publication" | "held-previous";
  readonly sampleId: number;
}): GpuFlowVisibleProjectionState {
  return {
    committedFrame: preparedContentFrame({ displayFrameId }),
    debugState: {
      committedFrameId: displayFrameId,
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

function preparedContentFrame({
  displayFrameId,
}: {
  readonly displayFrameId: number;
}): GpuFlowCommittedSurfaceFrame {
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
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
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowCommittedSurfaceFrame;
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
