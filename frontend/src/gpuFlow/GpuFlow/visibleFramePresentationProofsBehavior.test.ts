import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import {
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
  type GpuFlowLiveProjectionSample,
} from "../projectionRuntime";
import type { SurfaceDisplayTransaction } from "../surfaceCompositor/surfaceTransaction";
import {
  createGpuFlowVisiblePublicationCanvasPresentationEvidence,
  createGpuFlowVisiblePublicationDomTransformPresentationEvidence,
  createGpuFlowVisiblePublicationTextureEvictionPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import {
  assertGpuFlowVisibleFramePresentationToken,
  proveGpuFlowVisibleFramePublicationPresentation,
  type GpuFlowPresentationAuthorityProof,
} from "./visibleFramePresentationProofs";
import { proveGpuFlowVisibleFrameStateMachineFrame } from "./visibleFrameStateMachine";
import { createGpuFlowVisibleFramePresentationTokenForTest } from "./visibleFrameTestUtils";
import { createGpuFlowContentFrameId } from "./visibleFrameTypes";

describe("GPU Flow visible frame presentation proof behavior", () => {
  it("rejects presentation authority for non-publishable frames", () => {
    expect(() =>
      createGpuFlowVisibleFramePresentationTokenForTest({
        frame: committedSurfaceFrame({
          publishability: {
            blockingActorIds: ["actor-a"],
            kind: "hold-previous",
            reason: "visible-dom-control-not-projected",
          },
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/publishable committed surface frame/);
  });

  it("rejects presentation authority for incoherent DOM/canvas presentation pairs", () => {
    expect(() =>
      createGpuFlowVisibleFramePresentationTokenForTest({
        frame: committedSurfaceFrame({
          coherence: {
            domControlCommittedFrameId: 42,
          },
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/DOM and canvas generations for the same committed frame/);
  });

  it("rejects presentation authority when the DOM generation is not staged and exposable", () => {
    const frame = committedSurfaceFrame();

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
        } as unknown as GpuFlowCommittedSurfaceFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/DOM generation staged and exposable/);
  });

  it("rejects presentation authority when the canvas generation is not prepared and exposable", () => {
    const frame = committedSurfaceFrame();

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
        } as unknown as GpuFlowCommittedSurfaceFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/canvas generation prepared and exposable/);
  });

  it("rejects presentation authority when DOM and canvas generations are not in the same presentation batch", () => {
    const frame = committedSurfaceFrame();

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
        } as unknown as GpuFlowCommittedSurfaceFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/same presentation batch/);
  });

  it("carries DOM/canvas presentation pair proof on presentation tokens", () => {
    const frame = committedSurfaceFrame();
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
    const frame = committedSurfaceFrame({
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
      /^setta-gpu-flow-digest:v1:committed-surface-actor-manifest:/,
    );
    expect(token.presentationPairDigest).toMatch(
      /^setta-gpu-flow-digest:v1:visible-presentation-pair:/,
    );
    expect(token.proofDigest).toMatch(
      /^setta-gpu-flow-digest:v1:visible-publication-proof:/,
    );
    expect(token.expectedActorSetDigest.length).toBeLessThan(120);
    expect(token.presentationPairDigest.length).toBeLessThan(120);
    expect(token.proofDigest.length).toBeLessThan(120);
  });

  it("rejects presentation token issuance without the proof proof digest for the selected frame", async () => {
    const { createGpuFlowPresentationAuthorityProof } = await import(
      "./visibleFramePresentationProofs"
    );
    const frame = committedSurfaceFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "content-publication",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });

    expect(() =>
      proveGpuFlowVisibleFramePublicationPresentationForCommit({
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
    const frame = committedSurfaceFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "content-publication",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });

    expect(() =>
      proveGpuFlowVisibleFramePublicationPresentationForCommit({
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
    const frame = committedSurfaceFrame();
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
      proveGpuFlowVisibleFramePublicationPresentationForCommit({
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
    const frame = committedSurfaceFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "content-publication",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });

    expect(() =>
      proveGpuFlowVisibleFramePublicationPresentationForCommit({
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
    const frame = committedSurfaceFrame({
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
        projectionTransactionKind: "content-publication",
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
      const frame = committedSurfaceFrame({
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
      } as unknown as GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

      expect(() =>
        createGpuFlowVisibleFramePresentationTokenForTest({
          frame: {
            ...frame,
            actorGenerations: [changedActor],
          } as unknown as GpuFlowCommittedSurfaceFrame,
          projectionSample: liveProjectionSample(),
        }),
      ).toThrow(/actor manifest and browser visual resources/);
    },
  );

  it("rejects presentation tokens when the DOM/canvas presentation proof changes after minting", () => {
    const frame = committedSurfaceFrame();
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
        } as unknown as GpuFlowCommittedSurfaceFrame,
        token,
      }),
    ).toThrow(/visible frame presentation token for the same visible frame/);
  });

  it("wakes the coordinator for browser visual blocked content debt", () => {
    const projectionSample = liveProjectionSample();
    const completion = proveGpuFlowVisibleFramePublicationPresentation({
      forceImmediatePublicationDebtFrame: false,
      followUpFrameReason: null,
      previousVisibleProjectionState: null,
      publicationDecision: {
        debt: { content: false, maintenance: false, motion: false },
        lane: "content",
        rawReasons: ["manual"],
        sample: projectionSample,
        schedulerState: "content-catchup",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
      >[0]["publicationDecision"],
      reducerRuntime: {
        completeFrame: () => {
          throw new Error("Unexpected committed frame completion.");
        },
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUncommittedFrame: () => ({
          debt: { content: true, maintenance: false, motion: false },
          outcome: "blocked",
        }),
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
          source: "content-publication",
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
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
    const completion = proveGpuFlowVisibleFramePublicationPresentation({
      forceImmediatePublicationDebtFrame: false,
      followUpFrameReason: null,
      previousVisibleProjectionState: null,
      publicationDecision: {
        debt: { content: false, maintenance: false, motion: false },
        lane: "content",
        rawReasons: ["manual"],
        sample: projectionSample,
        schedulerState: "content-catchup",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
      >[0]["publicationDecision"],
      reducerRuntime: {
        completeFrame: () => {
          throw new Error("Unexpected committed frame completion.");
        },
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUncommittedFrame: () => ({
          debt: { content: true, maintenance: false, motion: false },
          outcome: "blocked",
        }),
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
          source: "content-publication",
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
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
    const completion = proveGpuFlowVisibleFramePublicationPresentation({
      forceImmediatePublicationDebtFrame: false,
      followUpFrameReason: null,
      previousVisibleProjectionState: null,
      publicationDecision: {
        debt: { content: false, maintenance: true, motion: false },
        lane: "content",
        rawReasons: ["manual"],
        sample: projectionSample,
        schedulerState: "content-catchup",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
      >[0]["publicationDecision"],
      reducerRuntime: {
        completeFrame: () => {
          throw new Error("Unexpected committed frame completion.");
        },
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUncommittedFrame: () => ({
          debt: { content: true, maintenance: true, motion: false },
          outcome: "blocked",
        }),
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
          source: "content-publication",
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
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
    const frame = committedSurfaceFrame();
    const projectionSample = liveProjectionSample();
    const pairProof = presentationPairProof({ frame, projectionSample });
    const presentationAuthorityProof = createGpuFlowPresentationAuthorityProof({
      frame,
      presentationPairProof: pairProof,
      projectionSampleId: projectionSample.id,
      projectionTransactionKind: "content-publication",
      projectionTransactionId:
        pairProof.canvasGenerationEvidence.projectionTransactionId,
    });
    const completion = proveGpuFlowVisibleFramePublicationPresentation({
      forceImmediatePublicationDebtFrame: false,
      followUpFrameReason: null,
      previousVisibleProjectionState: null,
      publicationDecision: {
        debt: { content: true, maintenance: false, motion: true },
        lane: "maintenance",
        rawReasons: ["texture-upload"],
        sample: projectionSample,
        schedulerState: "maintenance-drain",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
      >[0]["publicationDecision"],
      reducerRuntime: {
        completeFrame: () => ({
          debt: { content: true, maintenance: false, motion: true },
          outcome: "present",
        }),
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUncommittedFrame: () => {
          throw new Error("Unexpected uncommitted frame completion.");
        },
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
          committedFrame: frame,
          heldPreviousProjection: null,
          sample: projectionSample,
          transaction: {
            kind: "content-publication",
          },
        },
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
    const completion = proveGpuFlowVisibleFramePublicationPresentation({
      forceImmediatePublicationDebtFrame: false,
      followUpFrameReason: "texture-upload",
      previousVisibleProjectionState: null,
      publicationDecision: {
        debt: { content: false, maintenance: true, motion: true },
        lane: "content",
        rawReasons: ["texture-upload"],
        sample: projectionSample,
        schedulerState: "content-catchup",
      } as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
      >[0]["publicationDecision"],
      reducerRuntime: {
        completeFrame: () => {
          throw new Error("Unexpected committed frame completion.");
        },
        getKnobs: () => DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        recordUncommittedFrame: () => ({
          debt: { content: true, maintenance: true, motion: true },
          outcome: "blocked",
        }),
      } as unknown as Parameters<
        typeof proveGpuFlowVisibleFramePublicationPresentation
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
        typeof proveGpuFlowVisibleFramePublicationPresentation
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

function proveGpuFlowVisibleFramePublicationPresentationForCommit({
  presentationAuthorityProof,
  frame,
  projectionSample,
}: {
  readonly presentationAuthorityProof: GpuFlowPresentationAuthorityProof;
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): void {
  proveGpuFlowVisibleFramePublicationPresentation({
    forceImmediatePublicationDebtFrame: false,
    followUpFrameReason: null,
    previousVisibleProjectionState: null,
    publicationDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample: projectionSample,
      schedulerState: "idle",
    } as unknown as Parameters<
      typeof proveGpuFlowVisibleFramePublicationPresentation
    >[0]["publicationDecision"],
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
      recordUncommittedFrame: () => ({
        debt: {
          content: true,
          maintenance: true,
          motion: true,
        },
        kind: "uncommitted",
      }),
    } as unknown as Parameters<
      typeof proveGpuFlowVisibleFramePublicationPresentation
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
        committedFrame: frame,
        heldPreviousProjection: null,
        sample: projectionSample,
        transaction: {
          kind: "content-publication",
        },
      },
    } as unknown as Parameters<
      typeof proveGpuFlowVisibleFramePublicationPresentation
    >[0]["transactionProof"],
  });
}

function presentationPairProof({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}) {
  return {
    ...frame.presentationProof,
    canvasGenerationEvidence:
      createGpuFlowVisiblePublicationCanvasPresentationEvidence({
        committedFrame: frame,
        projectionSampleId: projectionSample.id,
        projectionTransactionId: `test-content-publication:${frame.displayFrameId}:${projectionSample.id}`,
      }),
    domTransformEvidence:
      createGpuFlowVisiblePublicationDomTransformPresentationEvidence({
        committedFrame: frame,
        projectionSampleId: projectionSample.id,
        projectionTransactionId: `test-content-publication:${frame.displayFrameId}:${projectionSample.id}`,
      }),
    projectionSampleId: projectionSample.id,
    projectionTransactionKind: "content-publication" as const,
    textureEvictionEvidence:
      createGpuFlowVisiblePublicationTextureEvictionPresentationEvidence({
        committedFrame: frame,
        projectionSampleId: projectionSample.id,
        projectionTransactionId: `test-content-publication:${frame.displayFrameId}:${projectionSample.id}`,
      }),
  };
}

function committedSurfaceFrame({
  actorGenerations = [],
  coherence = {},
  publishability = {
    blockingActorIds: [],
    kind: "publishable",
  },
  surfaceTransaction = null,
}: {
  readonly actorGenerations?:
    | readonly GpuFlowCommittedSurfaceFrame["actorGenerations"][number][]
    | undefined;
  readonly coherence?:
    | Partial<GpuFlowCommittedSurfaceFrame["coherence"]>
    | undefined;
  readonly publishability?:
    | Partial<GpuFlowCommittedSurfaceFrame["publishability"]>
    | undefined;
  readonly surfaceTransaction?: SurfaceDisplayTransaction | null | undefined;
} = {}): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = 7;
  const committedCoherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
    ...coherence,
  };
  return {
    actorGenerations,
    coherence: committedCoherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
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
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
      ...publishability,
    },
    surfaceTransaction,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

type CommittedBrowserVisualProof = NonNullable<
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number]["browserVisual"]
>["proof"];

function committedActorGeneration({
  actorId,
  proof = null,
  resourceHandles,
}: {
  readonly actorId: string;
  readonly proof?: CommittedBrowserVisualProof | null | undefined;
  readonly resourceHandles: NonNullable<
    GpuFlowCommittedSurfaceFrame["actorGenerations"][number]["browserVisual"]
  >["resourceHandles"];
}): GpuFlowCommittedSurfaceFrame["actorGenerations"][number] {
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
  } as unknown as GpuFlowCommittedSurfaceFrame["actorGenerations"][number];
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
