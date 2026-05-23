import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { SurfaceDisplayTransaction } from "../surfaceCompositor/surfaceTransaction";
import { assertGpuFlowCommitPublicationToken } from "./visibleFramePublicationAuthority";
import { createGpuFlowVisibleFrameCommitPublicationTokenForTest } from "./visibleFramePublicationTestUtils";

describe("GPU Flow visible publication authority behavior", () => {
  it("rejects commit authority for non-publishable frames", () => {
    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationTokenForTest({
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

  it("rejects commit authority for incoherent DOM/canvas presentation pairs", () => {
    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationTokenForTest({
        frame: committedSurfaceFrame({
          coherence: {
            domControlCommittedFrameId: 42,
          },
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/DOM and canvas generations for the same committed frame/);
  });

  it("rejects commit authority when the DOM generation is not staged and exposable", () => {
    const frame = committedSurfaceFrame();

    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationTokenForTest({
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

  it("rejects commit authority when the canvas generation is not prepared and exposable", () => {
    const frame = committedSurfaceFrame();

    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationTokenForTest({
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

  it("rejects commit authority when DOM and canvas generations are not in the same presentation batch", () => {
    const frame = committedSurfaceFrame();

    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationTokenForTest({
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

  it("carries DOM/canvas presentation pair proof on commit tokens", () => {
    const frame = committedSurfaceFrame();
    const projectionSample = liveProjectionSample();
    const token = createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame,
      projectionSample,
    });

    expect(token.presentationPairProof).toEqual({
      ...frame.presentationProof,
      projectionSampleId: projectionSample.id,
    });
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

  it("rejects presentable commits without the oracle proof digest for the selected frame", async () => {
    const {
      createGpuFlowCommitAuthorityProof,
      createGpuFlowPresentableCommit,
    } = await import("./visibleFramePublicationAuthority");
    const frame = committedSurfaceFrame();
    const projectionSample = liveProjectionSample();
    const commitAuthorityProof = createGpuFlowCommitAuthorityProof({
      frame,
      presentationPairProof: {
        ...frame.presentationProof,
        projectionSampleId: projectionSample.id,
      },
      projectionSampleId: projectionSample.id,
    });

    expect(() =>
      createGpuFlowPresentableCommit({
        frame,
        commitAuthorityProof: {
          ...commitAuthorityProof,
          proofDigest: "stale-visible-proof",
        },
        projectionSample,
      }),
    ).toThrow(/transaction oracle presentable commit proof/);
  });

  it("rejects presentable commits without the oracle DOM/canvas pair proof for the projection sample", async () => {
    const {
      createGpuFlowCommitAuthorityProof,
      createGpuFlowPresentableCommit,
    } = await import("./visibleFramePublicationAuthority");
    const frame = committedSurfaceFrame();
    const projectionSample = liveProjectionSample();
    const commitAuthorityProof = createGpuFlowCommitAuthorityProof({
      frame,
      presentationPairProof: {
        ...frame.presentationProof,
        projectionSampleId: projectionSample.id,
      },
      projectionSampleId: projectionSample.id,
    });

    expect(() =>
      createGpuFlowPresentableCommit({
        frame,
        commitAuthorityProof: {
          ...commitAuthorityProof,
          presentationPairProof: {
            ...commitAuthorityProof.presentationPairProof,
            projectionSampleId: projectionSample.id + 1,
          },
        },
        projectionSample,
      }),
    ).toThrow(/DOM\/canvas presentation pair proof/);
  });

  it("rejects presentable commits without the oracle resource protection proof", async () => {
    const {
      createGpuFlowCommitAuthorityProof,
      createGpuFlowPresentableCommit,
    } = await import("./visibleFramePublicationAuthority");
    const frame = committedSurfaceFrame();
    const projectionSample = liveProjectionSample();
    const commitAuthorityProof = createGpuFlowCommitAuthorityProof({
      frame,
      presentationPairProof: {
        ...frame.presentationProof,
        projectionSampleId: projectionSample.id,
      },
      projectionSampleId: projectionSample.id,
    });

    expect(() =>
      createGpuFlowPresentableCommit({
        frame,
        commitAuthorityProof: {
          ...commitAuthorityProof,
          resourceProtectionDigest: "stale-resource-protection-proof",
        },
        projectionSample,
      }),
    ).toThrow(/resource protection proof/);
  });

  it("rejects presentable commits when actor proof resources are not protected", async () => {
    const {
      createGpuFlowCommitAuthorityProof,
    } = await import("./visibleFramePublicationAuthority");
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
    expect(() =>
      createGpuFlowCommitAuthorityProof({
        frame,
        presentationPairProof: {
          ...frame.presentationProof,
          projectionSampleId: projectionSample.id,
        },
        projectionSampleId: projectionSample.id,
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
    "rejects commit authority when active-editor proof changes after presentation staging",
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
        createGpuFlowVisibleFrameCommitPublicationTokenForTest({
          frame: {
            ...frame,
            actorGenerations: [changedActor],
          } as unknown as GpuFlowCommittedSurfaceFrame,
          projectionSample: liveProjectionSample(),
        }),
      ).toThrow(/actor manifest and browser visual resources/);
    },
  );

  it("rejects commit tokens when the DOM/canvas presentation proof changes after minting", () => {
    const frame = committedSurfaceFrame();
    const token = createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame,
      projectionSample: liveProjectionSample(),
    });

    expect(() =>
      assertGpuFlowCommitPublicationToken({
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
    ).toThrow(/commit publication token for the same visible frame/);
  });
});

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
