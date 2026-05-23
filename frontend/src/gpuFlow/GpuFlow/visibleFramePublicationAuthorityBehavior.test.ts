import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { SurfaceDisplayTransaction } from "../surfaceCompositor/surfaceTransaction";
import { assertGpuFlowCommitPublicationToken } from "./visibleFramePublicationAuthority";
import { createGpuFlowVisibleFrameCommitPublicationToken } from "./visibleFramePublicationKernel";

describe("GPU Flow visible publication authority behavior", () => {
  it("rejects commit authority for non-publishable frames", () => {
    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationToken({
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
      createGpuFlowVisibleFrameCommitPublicationToken({
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
      createGpuFlowVisibleFrameCommitPublicationToken({
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
      createGpuFlowVisibleFrameCommitPublicationToken({
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
      createGpuFlowVisibleFrameCommitPublicationToken({
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

  it("rejects commit authority when actor proof resources are not protected", () => {
    const resourceHandle = {
      id: "snapshot-a",
      kind: "texture" as const,
    };

    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationToken({
        frame: committedSurfaceFrame({
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
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/requires protected resources/);
  });

  it("rejects commit tokens when the DOM/canvas presentation proof changes after minting", () => {
    const frame = committedSurfaceFrame();
    const token = createGpuFlowVisibleFrameCommitPublicationToken({
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

function committedActorGeneration({
  actorId,
  resourceHandles,
}: {
  readonly actorId: string;
  readonly resourceHandles: NonNullable<
    GpuFlowCommittedSurfaceFrame["actorGenerations"][number]["browserVisual"]
  >["resourceHandles"];
}): GpuFlowCommittedSurfaceFrame["actorGenerations"][number] {
  return {
    actorFamily: "text-like-dom-control",
    actorId,
    browserVisual: {
      coverageState: "exact",
      proof: null,
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
      compatibleCoverage: [],
      exactCoverage: [
        {
          resourceHandles,
        },
      ],
      protectedResourceHandles,
      trueHoleRects: [],
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
