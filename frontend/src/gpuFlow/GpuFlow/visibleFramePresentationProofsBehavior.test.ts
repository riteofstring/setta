import { describe, expect, it } from "vitest";

import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import {
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
  type GpuFlowLiveProjectionSample,
} from "../projectionRuntime";
import type { SurfaceDisplayTransaction } from "../surfaceCompositor/surfaceTransaction";
import {
  createGpuFlowVisibleFramePresentationCanvasPresentationEvidence,
  createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence,
  createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import {
  assertGpuFlowVisibleFramePresentationToken,
  proveGpuFlowVisibleFramePresentationProof,
  type GpuFlowPresentationAuthorityProof,
} from "./visibleFramePresentationProofs";
import { proveGpuFlowVisibleFrameStateMachineFrame } from "./visibleFrameStateMachine";
import { createGpuFlowVisibleFramePresentationTokenForTest } from "./visibleFrameTestUtils";
import { createGpuFlowContentFrameId } from "./visibleFrameTypes";

describe("GPU Flow visible frame presentation proof behavior", () => {
  it("rejects presentation authority for non-presentable frames", () => {
    expect(() =>
      createGpuFlowVisibleFramePresentationTokenForTest({
        frame: preparedContentFrame({
          presentability: {
            blockingActorIds: ["actor-a"],
            kind: "hold-previous",
            reason: "visible-dom-control-not-projected",
          },
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/presentable prepared content frame frame/);
  });

  it("rejects presentation authority for incoherent DOM/canvas presentation pairs", () => {
    expect(() =>
      createGpuFlowVisibleFramePresentationTokenForTest({
        frame: preparedContentFrame({
          coherence: {
            domControlPreparedFrameId: 42,
          },
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/DOM and canvas generations for the same prepared frame/);
  });

  it("rejects presentation authority when the DOM generation is not staged and exposable", () => {
    const frame = preparedContentFrame();

    expect(() =>
      createGpuFlowVisibleFramePresentationTokenForTest({
        frame: {
          ...frame,
          presentationProof: {
            ...frame.presentationProof,
            domGeneration: {
              ...frame.presentationProof.domGeneration,
              staged: false,
            },
          },
        } as unknown as GpuFlowPreparedContentFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/DOM generation staged and exposable/);
  });

  it("rejects presentation authority when the canvas generation is not prepared and exposable", () => {
    const frame = preparedContentFrame();

    expect(() =>
      createGpuFlowVisibleFramePresentationTokenForTest({
        frame: {
          ...frame,
          presentationProof: {
            ...frame.presentationProof,
            canvasGeneration: {
              ...frame.presentationProof.canvasGeneration,
              prepared: false,
            },
          },
        } as unknown as GpuFlowPreparedContentFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/canvas generation prepared and exposable/);
  });

  it("rejects presentation authority when DOM and canvas generations are not in the same presentation batch", () => {
    const frame = preparedContentFrame();

    expect(() =>
      createGpuFlowVisibleFramePresentationTokenForTest({
        frame: {
          ...frame,
          presentationProof: {
            ...frame.presentationProof,
            domGeneration: {
              ...frame.presentationProof.domGeneration,
              presentationBatchId: "presentation:other",
            },
          },
        } as unknown as GpuFlowPreparedContentFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/same presentation batch/);
  });

  it("carries DOM/canvas presentation pair proof on presentation tokens", () => {
    const frame = preparedContentFrame();
    const projectionSample = liveProjectionSample();
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame,
      projectionSample,
    });

    expect(token.presentationPairProof).toEqual(
      presentationPairProof({ frame, projectionSample }),
    );
    expect(token.presentationPairProof.domGeneration).toEqual(
      expect.objectContaining({
        exposable: true,
        presentationBatchId: frame.presentationProof.batchId,
        staged: true,
      }),
    );
    expect(token.presentationPairProof.canvasGeneration).toEqual(
      expect.objectContaining({
        exposable: true,
        prepared: true,
        presentationBatchId: frame.presentationProof.batchId,
      }),
    );
    expect(token.resourceProtectionDigest).toBe(
      JSON.stringify({
        missingResourceKeys: [],
        protected: true,
        protectedResourceKeys: [],
        requiredResourceKeys: [],
      }),
    );
  });

  it("keeps presentable frame proof digests compact for large actor manifests", () => {
    const frame = preparedContentFrame({
      actorGenerations: Array.from({ length: 80 }, (_, index) =>
        committedActorGeneration({
          actorId: `actor-${index}`,
          resourceHandles: [],
        }),
      ),
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame,
      projectionSample: liveProjectionSample(),
    });

    expect(token.expectedActorSetDigest).toMatch(
      /^setta-gpu-flow-digest:v1:prepared-content-frame-actor-manifest:/,
    );
    expect(token.presentationPairDigest).toMatch(
      /^setta-gpu-flow-digest:v1:visible-presentation-pair:/,
    );
    expect(token.proofDigest).toMatch(
      /^setta-gpu-flow-digest:v1:visible-frame-presentation-proof:/,
    );
    expect(token.expectedActorSetDigest.length).toBeLessThan(120);
    expect(token.presentationPairDigest.length).toBeLessThan(120);
    expect(token.proofDigest.length).toBeLessThan(120);
  });

  it("rejects presentation token issuance without the proof proof digest for the selected frame", async () => {
    const { createGpuFlowPresentationAuthorityProof } = await import(
      "./visibleFramePresentationProofs"
    );
    const frame = preparedContentFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "prepared-content",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });

    expect(() =>
      proveGpuFlowVisibleFramePresentationProofForCommit({
        presentationAuthorityProof: {
          ...presentationAuthorityProof,
          proofDigest: "stale-visible-proof",
        },
        frame,
        projectionSample,
      }),
    ).toThrow(/transaction proof presentable frame proof/);
  });

  it("rejects presentation token issuance without the proof DOM/canvas pair proof for the projection sample", async () => {
    const { createGpuFlowPresentationAuthorityProof } = await import(
      "./visibleFramePresentationProofs"
    );
    const frame = preparedContentFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "prepared-content",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });

    expect(() =>
      proveGpuFlowVisibleFramePresentationProofForCommit({
        presentationAuthorityProof: {
          ...presentationAuthorityProof,
          presentationPairProof: {
            ...presentationAuthorityProof.presentationPairProof,
            batchId: "presentation:stale",
          },
        },
        frame,
        projectionSample,
      }),
    ).toThrow(/DOM\/canvas presentation pair proof/);
  });

  it("rejects presentation token issuance when the proof transaction kind differs from the selected visible state", async () => {
    const { createGpuFlowPresentationAuthorityProof } = await import(
      "./visibleFramePresentationProofs"
    );
    const frame = preparedContentFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = {
      ...presentationPairProof({ frame, projectionSample }),
      projectionTransactionKind: "motion-projection" as const,
      textureEvictionEvidence: null,
    };
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "motion-projection",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });

    expect(() =>
      proveGpuFlowVisibleFramePresentationProofForCommit({
        presentationAuthorityProof,
        frame,
        projectionSample,
      }),
    ).toThrow(/selected visible frame and projection sample/);
  });

  it("rejects presentation token issuance without the proof resource protection proof", async () => {
    const { createGpuFlowPresentationAuthorityProof } = await import(
      "./visibleFramePresentationProofs"
    );
    const frame = preparedContentFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "prepared-content",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });

    expect(() =>
      proveGpuFlowVisibleFramePresentationProofForCommit({
        presentationAuthorityProof: {
          ...presentationAuthorityProof,
          resourceProtectionDigest: "stale-resource-protection-proof",
        },
        frame,
        projectionSample,
      }),
    ).toThrow(/resource protection proof/);
  });

  it("rejects presentable frames when actor proof resources are not protected", async () => {
    const { createGpuFlowPresentationAuthorityProof } = await import(
      "./visibleFramePresentationProofs"
    );
    const resourceHandle = {
      id: "snapshot-a",
      kind: "texture" as const,
    };
    const frame = preparedContentFrame({
      actorGenerations: [
        committedActorGeneration({
          actorId: "actor-a",
          resourceHandles: [resourceHandle],
        }),
      ],
      surfaceTransaction: surfaceTransaction({
        protectedResourceHandles: [],
        resourceHandles: [resourceHandle],
      }),
    });
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    expect(() =>
      createGpuFlowPresentationAuthorityProof({
        frame,
        presentationPairProof: pairProof,
        projectionSampleId: projectionSample.id,
        projectionTransactionKind: "prepared-content",
        projectionTransactionId:
          pairProof.canvasGenerationEvidence.projectionTransactionId,
      }),
    ).toThrow(/requires protected resources/);
  });

  it.each([
    {
      actualInteraction: "active-editor-live" as const,
      actualVisual: "same-live-host-compatible-projection" as const,
    },
    {
      actualInteraction: "blocked" as const,
      actualVisual: "exact-live-host" as const,
    },
  ])(
    "rejects presentation authority when active-editor proof changes after presentation staging",
    ({ actualInteraction, actualVisual }) => {
      const actor = committedActorGeneration({
        actorId: "actor-a",
        proof: browserVisualProof(),
        resourceHandles: [],
      });
      const frame = preparedContentFrame({
        actorGenerations: [actor],
      });
      if (actor.browserVisual === null) {
        throw new Error(
          "Expected committed test actor to carry browser proof.",
        );
      }
      const changedActor = {
        ...actor,
        browserVisual: {
          ...actor.browserVisual,
          proof: browserVisualProof({
            actualInteraction,
            actualVisual,
          }),
        },
      } as unknown as GpuFlowPreparedContentFrame["actorGenerations"][number];

      expect(() =>
        createGpuFlowVisibleFramePresentationTokenForTest({
          frame: {
            ...frame,
            actorGenerations: [changedActor],
          } as unknown as GpuFlowPreparedContentFrame,
          projectionSample: liveProjectionSample(),
        }),
      ).toThrow(/actor manifest and browser visual resources/);
    },
  );

  it("rejects presentation tokens when the DOM/canvas presentation proof changes after minting", () => {
    const frame = preparedContentFrame();
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame,
      projectionSample: liveProjectionSample(),
    });

    expect(() =>
      assertGpuFlowVisibleFramePresentationToken({
        frame: {
          ...frame,
          presentationProof: {
            ...frame.presentationProof,
            domGeneration: {
              ...frame.presentationProof.domGeneration,
              presentationBatchId: "presentation:stale-dom",
            },
          },
        } as unknown as GpuFlowPreparedContentFrame,
        token,
      }),
    ).toThrow(/visible frame presentation token for the same visible frame/);
  });

  it("wakes the coordinator for browser visual blocked content debt", () => {
    const projectionSample = liveProjectionSample();
    const completion = proveGpuFlowVisibleFramePresentationProof({
      forceImmediateReducerDebtFrame: false,
      followUpFrameReason: null,
      previousVisibleProjectionState: null,
      reducerDecision: {
        debt: { content: false, maintenance: false, motion: false },
        lane: "content",
        rawReasons: ["manual"],
        sample: projectionSample,
        reducerState: "content-catchup",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerDecision"],
      reducerRuntime: {
        completeFrame: () => {
          throw new Error("Unexpected prepared content frame completion.");
        },
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUnpresentedFrame: () => ({
          debt: { content: true, maintenance: false, motion: false },
          outcome: "blocked",
        }),
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerRuntime"],
      transactionProof: {
        blockedProof: {
          blockedReasons: [
            {
              actorId: "actor-a",
              family: "browser-visual",
              reason: "live-dom-budget",
            },
          ],
          candidate: {
            blockedReasons: [
              {
                actorId: "actor-a",
                family: "browser-visual",
                reason: "live-dom-budget",
              },
            ],
            frozenFrameId: 7,
          },
          frozenFrameId: 7,
          source: "prepared-content",
        },
        renderedVisibleFrame: false,
        visibleFrameStateMachineOutcome: {
          debt: {
            browserVisual: true,
            content: true,
            maintenance: false,
            motion: false,
          },
          decidingProof: {
            actorId: "actor-a",
            family: "browser-visual",
            proof: "blocked",
            reason: "live-dom-budget",
          },
          kind: "aborted",
          previousPresentationId: "presentation:previous",
          releasedResourceIds: [],
        },
        visibleProjectionState: null,
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["transactionProof"],
    });

    expect(completion.outcome.kind).toBe("blocked");
    expect(completion.completeReducerFrame()).toEqual({
      completion: {
        debt: { content: true, maintenance: false, motion: false },
        outcome: "blocked",
      },
      debtFrameRequest: {
        delayMs: null,
        frameReason: "manual",
      },
    });
  });

  it("requests texture upload after section surface content blocks before manual repair", () => {
    const projectionSample = liveProjectionSample();
    const completion = proveGpuFlowVisibleFramePresentationProof({
      forceImmediateReducerDebtFrame: false,
      followUpFrameReason: null,
      previousVisibleProjectionState: null,
      reducerDecision: {
        debt: { content: false, maintenance: false, motion: false },
        lane: "content",
        rawReasons: ["manual"],
        sample: projectionSample,
        reducerState: "content-catchup",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerDecision"],
      reducerRuntime: {
        completeFrame: () => {
          throw new Error("Unexpected prepared content frame completion.");
        },
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUnpresentedFrame: () => ({
          debt: { content: true, maintenance: false, motion: false },
          outcome: "blocked",
        }),
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerRuntime"],
      transactionProof: {
        blockedProof: {
          blockedReasons: [
            {
              actorId: "section-a:section-shell",
              family: "section-shell",
              reason: "section-surface-not-drawn",
            },
            {
              actorId: "section-a:section-body-clip",
              family: "section-body-clip",
              reason: "section-surface-not-drawn",
            },
          ],
          candidate: {
            blockedReasons: [
              {
                actorId: "section-a:section-shell",
                family: "section-shell",
                reason: "section-surface-not-drawn",
              },
            ],
            frozenFrameId: 7,
          },
          frozenFrameId: 7,
          source: "prepared-content",
        },
        renderedVisibleFrame: false,
        visibleFrameStateMachineOutcome: {
          debt: {
            browserVisual: false,
            content: true,
            maintenance: false,
            motion: false,
          },
          decidingProof: {
            actorId: "section-a:section-shell",
            family: "section-shell",
            proof: "blocked",
            reason: "section-surface-not-drawn",
          },
          kind: "aborted",
          previousPresentationId: "presentation:previous",
          releasedResourceIds: [],
        },
        visibleProjectionState: null,
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["transactionProof"],
    });

    expect(completion.outcome.kind).toBe("blocked");
    expect(completion.completeReducerFrame()).toEqual({
      completion: {
        debt: { content: true, maintenance: false, motion: false },
        outcome: "blocked",
      },
      debtFrameRequest: {
        delayMs: null,
        frameReason: "texture-upload",
      },
    });
  });

  it("requests texture upload after pending browser text snapshot blocks content", () => {
    const projectionSample = liveProjectionSample();
    const completion = proveGpuFlowVisibleFramePresentationProof({
      forceImmediateReducerDebtFrame: false,
      followUpFrameReason: null,
      previousVisibleProjectionState: null,
      reducerDecision: {
        debt: { content: false, maintenance: true, motion: false },
        lane: "content",
        rawReasons: ["manual"],
        sample: projectionSample,
        reducerState: "content-catchup",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerDecision"],
      reducerRuntime: {
        completeFrame: () => {
          throw new Error("Unexpected prepared content frame completion.");
        },
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUnpresentedFrame: () => ({
          debt: { content: true, maintenance: true, motion: false },
          outcome: "blocked",
        }),
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerRuntime"],
      transactionProof: {
        blockedProof: {
          blockedReasons: [
            {
              actorId: "retained-dom-control:a",
              family: "browser-text-snapshot",
              reason: "snapshot-pending",
            },
          ],
          candidate: {
            blockedReasons: [
              {
                actorId: "retained-dom-control:a",
                family: "browser-text-snapshot",
                reason: "snapshot-pending",
              },
            ],
            frozenFrameId: 7,
          },
          frozenFrameId: 7,
          source: "prepared-content",
        },
        renderedVisibleFrame: false,
        visibleFrameStateMachineOutcome: {
          debt: {
            browserVisual: true,
            content: true,
            maintenance: true,
            motion: false,
          },
          decidingProof: {
            actorId: "retained-dom-control:a",
            family: "browser-text-snapshot",
            proof: "blocked",
            reason: "snapshot-pending",
          },
          kind: "aborted",
          previousPresentationId: "presentation:previous",
          releasedResourceIds: [],
        },
        visibleProjectionState: null,
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["transactionProof"],
    });

    expect(completion.outcome.kind).toBe("blocked");
    expect(completion.completeReducerFrame()).toEqual({
      completion: {
        debt: { content: true, maintenance: true, motion: false },
        outcome: "blocked",
      },
      debtFrameRequest: {
        delayMs: null,
        frameReason: "texture-upload",
      },
    });
  });

  it("requests content repair after maintenance clears browser visual resource debt", async () => {
    const { createGpuFlowPresentationAuthorityProof } = await import(
      "./visibleFramePresentationProofs"
    );
    const frame = preparedContentFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "prepared-content",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });
    const completion = proveGpuFlowVisibleFramePresentationProof({
      forceImmediateReducerDebtFrame: false,
      followUpFrameReason: null,
      previousVisibleProjectionState: null,
      reducerDecision: {
        debt: { content: true, maintenance: false, motion: true },
        lane: "maintenance",
        rawReasons: ["texture-upload"],
        sample: projectionSample,
        reducerState: "maintenance-drain",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerDecision"],
      reducerRuntime: {
        completeFrame: () => ({
          debt: { content: true, maintenance: false, motion: true },
          outcome: "present",
        }),
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUnpresentedFrame: () => {
          throw new Error("Unexpected unpresented frame completion.");
        },
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerRuntime"],
      transactionProof: {
        presentableFrameProof: {
          presentationAuthorityProof,
          debtProof: {
            content: false,
            maintenance: true,
            motion: false,
          },
        },
        renderedVisibleFrame: true,
        visibleFrameStateMachineOutcome:
          proveGpuFlowVisibleFrameStateMachineFrame({
            candidate: {
              actorProofs: [],
              contentFrameId: createGpuFlowContentFrameId(
                String(frame.displayFrameId),
              ),
              preparedResourceIds: [],
              projectionSampleId: projectionSample.id,
              queuedDebt: {
                browserVisual: false,
                content: false,
                maintenance: true,
                motion: false,
              },
              requiredActors: [],
            },
            previousPresentation: null,
          }),
        visibleProjectionState: {
          preparedContentFrame: frame,
          heldPreviousProjection: null,
          sample: projectionSample,
          transaction: {
            kind: "prepared-content",
          },
        },
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["transactionProof"],
    });

    expect(completion.completeReducerFrame()).toEqual({
      completion: {
        debt: { content: true, maintenance: false, motion: true },
        outcome: "present",
      },
      debtFrameRequest: {
        delayMs: null,
        frameReason: "manual",
      },
    });
  });

  it("keeps held-previous budget blocked retained follow-up queued behind reducer debt", () => {
    const projectionSample = liveProjectionSample();
    const completion = proveGpuFlowVisibleFramePresentationProof({
      forceImmediateReducerDebtFrame: false,
      followUpFrameReason: "texture-upload",
      previousVisibleProjectionState: null,
      reducerDecision: {
        debt: { content: false, maintenance: true, motion: true },
        lane: "content",
        rawReasons: ["texture-upload"],
        sample: projectionSample,
        reducerState: "content-catchup",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerDecision"],
      reducerRuntime: {
        completeFrame: () => {
          throw new Error("Unexpected prepared content frame completion.");
        },
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUnpresentedFrame: () => ({
          debt: { content: true, maintenance: true, motion: true },
          outcome: "blocked",
        }),
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["reducerRuntime"],
      transactionProof: {
        blockedProof: {
          blockedReasons: [
            {
              actorId: null,
              family: "visible-transaction",
              reason: "held-previous-budget-exceeded",
            },
          ],
          candidate: {
            blockedReasons: [
              {
                actorId: null,
                family: "visible-transaction",
                reason: "held-previous-budget-exceeded",
              },
            ],
            frozenFrameId: 7,
          },
          frozenFrameId: 7,
          source: "presentation-pair",
        },
        renderedVisibleFrame: false,
        visibleFrameStateMachineOutcome: {
          debt: {
            browserVisual: false,
            content: true,
            maintenance: true,
            motion: true,
          },
          decidingProof: {
            actorId: null,
            family: "retained-page",
            proof: "blocked",
            reason: "held-previous-budget-exceeded",
          },
          kind: "aborted",
          previousPresentationId: "presentation:previous",
          releasedResourceIds: [],
        },
        visibleProjectionState: null,
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePresentationProof
      >[0]["transactionProof"],
    });

    expect(completion.outcome.kind).toBe("blocked");
    expect(completion.followUpFrameRequests).toEqual(["texture-upload"]);
    expect(completion.completeReducerFrame()).toEqual({
      completion: {
        debt: { content: true, maintenance: true, motion: true },
        outcome: "blocked",
      },
      debtFrameRequest: {
        delayMs: null,
        frameReason: "retained-scroll",
      },
    });
  });
});

function proveGpuFlowVisibleFramePresentationProofForCommit({
  presentationAuthorityProof,
  frame,
  projectionSample,
}: {
  readonly presentationAuthorityProof: GpuFlowPresentationAuthorityProof;
  readonly frame: GpuFlowPreparedContentFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): void {
  proveGpuFlowVisibleFramePresentationProof({
    forceImmediateReducerDebtFrame: false,
    followUpFrameReason: null,
    previousVisibleProjectionState: null,
    reducerDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample: projectionSample,
      reducerState: "idle",
    } as unknown as Parameters<
      typeof proveGpuFlowVisibleFramePresentationProof
    >[0]["reducerDecision"],
    reducerRuntime: {
      completeFrame: () => ({
        debt: {
          content: false,
          maintenance: false,
          motion: false,
        },
        kind: "committed",
      }),
      getKnobs: () => ({
        maxHeldPreviousFrames: 6,
        maxHeldPreviousMs: 120,
        motionSettleWindowMs: 80,
      }),
      recordUnpresentedFrame: () => ({
        debt: {
          content: true,
          maintenance: true,
          motion: true,
        },
        kind: "unpresented",
      }),
    } as unknown as Parameters<
      typeof proveGpuFlowVisibleFramePresentationProof
    >[0]["reducerRuntime"],
    transactionProof: {
      presentableFrameProof: {
        presentationAuthorityProof,
        debtProof: {
          content: true,
          maintenance: true,
          motion: true,
        },
      },
      renderedVisibleFrame: true,
      visibleFrameStateMachineOutcome:
        proveGpuFlowVisibleFrameStateMachineFrame({
          candidate: {
            actorProofs: [],
            contentFrameId: createGpuFlowContentFrameId(
              String(frame.displayFrameId),
            ),
            preparedResourceIds: [],
            projectionSampleId: projectionSample.id,
            queuedDebt: {
              browserVisual: false,
              content: true,
              maintenance: true,
              motion: true,
            },
            requiredActors: [],
          },
          previousPresentation: null,
        }),
      visibleProjectionState: {
        preparedContentFrame: frame,
        heldPreviousProjection: null,
        sample: projectionSample,
        transaction: {
          kind: "prepared-content",
        },
      },
    } as unknown as Parameters<
      typeof proveGpuFlowVisibleFramePresentationProof
    >[0]["transactionProof"],
  });
}

function presentationPairProof({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}) {
  return {
    ...frame.presentationProof,
    canvasGenerationEvidence:
      createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
        preparedContentFrame: frame,
        projectionSampleId: projectionSample.id,
        projectionTransactionId: `test-prepared-content:${frame.displayFrameId}:${projectionSample.id}`,
      }),
    domTransformEvidence:
      createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
        preparedContentFrame: frame,
        projectionSampleId: projectionSample.id,
        projectionTransactionId: `test-prepared-content:${frame.displayFrameId}:${projectionSample.id}`,
      }),
    projectionSampleId: projectionSample.id,
    projectionTransactionKind: "prepared-content" as const,
    textureEvictionEvidence:
      createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence({
        preparedContentFrame: frame,
        projectionSampleId: projectionSample.id,
        projectionTransactionId: `test-prepared-content:${frame.displayFrameId}:${projectionSample.id}`,
      }),
  };
}

function preparedContentFrame({
  actorGenerations = [],
  coherence = {},
  presentability = {
    blockingActorIds: [],
    kind: "presentable",
  },
  surfaceTransaction = null,
}: {
  readonly actorGenerations?:
    | readonly GpuFlowPreparedContentFrame["actorGenerations"][number][]
    | undefined;
  readonly coherence?:
    | Partial<GpuFlowPreparedContentFrame["coherence"]>
    | undefined;
  readonly presentability?:
    | Partial<GpuFlowPreparedContentFrame["presentability"]>
    | undefined;
  readonly surfaceTransaction?: SurfaceDisplayTransaction | null | undefined;
} = {}): GpuFlowPreparedContentFrame {
  const displayFrameId = 7;
  const committedCoherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlPreparedFrameId: displayFrameId,
    domIslandPreparedFrameId: displayFrameId,
    gpuNativeVisualPreparedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayPreparedFrameId: displayFrameId,
    retainedScrollRevision: 0,
    ...coherence,
  };
  return {
    actorGenerations,
    coherence: committedCoherence,
    displayFrameId,
    presentationProof: createGpuFlowPreparedContentPresentationProof({
      actorGenerations,
      coherence: committedCoherence,
      displayFrameId,
      surfaceTransaction,
    }),
    projectionHorizon: {
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
      ...presentability,
    },
    surfaceTransaction,
  } as unknown as GpuFlowPreparedContentFrame;
}

type CommittedBrowserVisualProof = NonNullable<
  GpuFlowPreparedContentFrame["actorGenerations"][number]["browserVisual"]
>["proof"];

function committedActorGeneration({
  actorId,
  proof = null,
  resourceHandles,
}: {
  readonly actorId: string;
  readonly proof?: CommittedBrowserVisualProof | null | undefined;
  readonly resourceHandles: NonNullable<
    GpuFlowPreparedContentFrame["actorGenerations"][number]["browserVisual"]
  >["resourceHandles"];
}): GpuFlowPreparedContentFrame["actorGenerations"][number] {
  return {
    actorFamily: "text-like-dom-control",
    actorId,
    browserVisual: {
      coverageState: "exact",
      proof,
      resourceHandles,
    },
    canonicalActorId: actorId,
    contentGenerationId: `content:${actorId}`,
    generationClassification: "browser-visual",
    generationId: `generation:${actorId}`,
    kind: "dom-control",
    layoutProjectionGenerationId: `layout:${actorId}`,
    ownerSurfaceId: `surface:${actorId}`,
    textCoverageProof: null,
  } as unknown as GpuFlowPreparedContentFrame["actorGenerations"][number];
}

function browserVisualProof({
  actualInteraction = "active-editor-live",
  actualVisual = "exact-live-host",
}: {
  readonly actualInteraction?:
    | CommittedBrowserVisualProof["actualInteraction"]
    | undefined;
  readonly actualVisual?:
    | CommittedBrowserVisualProof["actualVisual"]
    | undefined;
} = {}): CommittedBrowserVisualProof {
  return {
    actualInteraction,
    actualVisual,
    requiredInteraction: "active-editor-live",
    requiredVisual: "browser-visual",
  };
}

function surfaceTransaction({
  protectedResourceHandles,
  resourceHandles,
}: {
  readonly protectedResourceHandles: SurfaceDisplayTransaction["protectedResourceHandles"];
  readonly resourceHandles: readonly {
    readonly id: string;
    readonly kind: string;
  }[];
}): SurfaceDisplayTransaction {
  return {
    coverageProof: {
      blockingGenerationIds: [],
      blockingSurfaceIds: [],
      compatibleCoverage: [],
      exactCoverage: [
        {
          resourceHandles,
        },
      ],
      protectedResourceHandles,
      rendererBuckets: [],
      trueHoleRects: [],
      visibleRects: [],
      zOrder: [],
    },
    desiredSurfaceGenerations: [],
    drawCommands: [],
    hitIndex: {
      generationIds: [],
      id: "hit:transaction",
    },
    id: "surface-transaction",
    protectedResourceHandles,
    rendererBuckets: [],
    zOrder: [],
  } as unknown as SurfaceDisplayTransaction;
}

function liveProjectionSample(): GpuFlowLiveProjectionSample {
  return {
    id: 11,
  } as GpuFlowLiveProjectionSample;
}
