import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import { createGpuFlowCommittedSurfaceRuntime } from "./committedSurfaceRuntime";
import {
  createGpuFlowCommittedSurfaceResetPublicationToken,
  createGpuFlowCommittedSurfaceStartupPublicationToken,
} from "./GpuFlow/visibleFramePublicationKernel";
import { createGpuFlowVisibleFrameCommitPublicationTokenForTest } from "./GpuFlow/visibleFramePublicationTestUtils";
import type { GpuFlowLiveProjectionSample } from "./projectionRuntime";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";

describe("GPU Flow committed surface runtime", () => {
  it("notifies committed-frame subscribers synchronously while deferring React semantic observers", async () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    const nextFrame = committedFrame({
      actorGenerations: [committedActor("actor-next")],
      displayFrameId: 2,
    });
    const notifications: string[] = [];
    runtime.subscribeCommittedContentFrame(() => {
      notifications.push(
        `committed:${runtime.getCommittedContentFrame().displayFrameId}`,
      );
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      notifications.push(
        `semantic:${runtime.getReactSemanticSnapshot().frame.displayFrameId}`,
      );
    });

    expect(
      runtime.publishCommittedContentFrame(
        publicationToken(nextFrame),
        nextFrame,
      ),
    ).toBe(true);

    expect(runtime.getCommittedContentFrame()).toBe(nextFrame);
    expect(runtime.getReactSemanticSnapshot().frame).toBe(nextFrame);
    expect(notifications).toEqual(["committed:2"]);

    await nextMicrotask();

    expect(notifications).toEqual(["committed:2", "semantic:2"]);
  });

  it("coalesces React semantic observers behind the latest committed frame", async () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    const firstFrame = committedFrame({
      actorGenerations: [committedActor("actor-first")],
      displayFrameId: 2,
    });
    const secondFrame = committedFrame({
      actorGenerations: [committedActor("actor-second")],
      displayFrameId: 3,
    });
    const committedFrameIds: number[] = [];
    const semanticFrameIds: number[] = [];
    runtime.subscribeCommittedContentFrame(() => {
      committedFrameIds.push(runtime.getCommittedContentFrame().displayFrameId);
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      semanticFrameIds.push(
        runtime.getReactSemanticSnapshot().frame.displayFrameId,
      );
    });

    expect(
      runtime.publishCommittedContentFrame(
        publicationToken(firstFrame),
        firstFrame,
      ),
    ).toBe(true);
    expect(
      runtime.publishCommittedContentFrame(
        publicationToken(secondFrame),
        secondFrame,
      ),
    ).toBe(true);

    expect(runtime.getCommittedContentFrame()).toBe(secondFrame);
    expect(committedFrameIds).toEqual([2, 3]);
    expect(semanticFrameIds).toEqual([]);

    await nextMicrotask();

    expect(semanticFrameIds).toEqual([3]);
  });

  it("notifies committed-frame subscribers for render-signature deduped frames", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    let committedFrameUpdates = 0;
    let semanticUpdates = 0;
    runtime.subscribeCommittedContentFrame(() => {
      committedFrameUpdates += 1;
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      semanticUpdates += 1;
    });

    const transformOnlyFrame = committedFrame({ displayFrameId: 2 });
    expect(
      runtime.publishCommittedContentFrame(
        publicationToken(transformOnlyFrame),
        transformOnlyFrame,
      ),
    ).toBe(false);

    expect(runtime.getCommittedContentFrame()).toBe(transformOnlyFrame);
    expect(runtime.getReactSemanticSnapshot().frame).toBe(startupFrame);
    expect(committedFrameUpdates).toBe(1);
    expect(semanticUpdates).toBe(0);
  });

  it("keeps startup committed-frame subscribers current when semantic identity is unchanged", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    let committedFrameUpdates = 0;
    let semanticUpdates = 0;
    runtime.subscribeCommittedContentFrame(() => {
      committedFrameUpdates += 1;
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      semanticUpdates += 1;
    });

    const nextStartupFrame = committedFrame({ displayFrameId: 2 });
    runtime.setStartupFrame(
      createGpuFlowCommittedSurfaceStartupPublicationToken({
        frame: nextStartupFrame,
      }),
      nextStartupFrame,
    );

    expect(runtime.getCommittedContentFrame()).toBe(nextStartupFrame);
    expect(runtime.getReactSemanticSnapshot().frame).toBe(startupFrame);
    expect(committedFrameUpdates).toBe(1);
    expect(semanticUpdates).toBe(0);
  });

  it("rejects committed content publication with a token for a different visible frame", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    const nextFrame = committedFrame({ displayFrameId: 2 });

    expect(() =>
      runtime.publishCommittedContentFrame(
        publicationToken(startupFrame),
        nextFrame,
      ),
    ).toThrow(/requires a commit publication token/);
  });

  it("rejects unbranded startup and reset lifecycle tokens", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    const nextStartupFrame = committedFrame({ displayFrameId: 2 });

    expect(() =>
      runtime.setStartupFrame(
        {} as ReturnType<
          typeof createGpuFlowCommittedSurfaceStartupPublicationToken
        >,
        nextStartupFrame,
      ),
    ).toThrow(/startup token/);
    expect(() =>
      runtime.resetCommittedContentFrame(
        {} as ReturnType<
          typeof createGpuFlowCommittedSurfaceResetPublicationToken
        >,
      ),
    ).toThrow(/reset publication token/);
  });

  it("rejects startup lifecycle tokens for a different startup frame", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    const tokenFrame = committedFrame({ displayFrameId: 2 });
    const nextStartupFrame = committedFrame({ displayFrameId: 3 });

    expect(() =>
      runtime.setStartupFrame(
        createGpuFlowCommittedSurfaceStartupPublicationToken({
          frame: tokenFrame,
        }),
        nextStartupFrame,
      ),
    ).toThrow(/same startup frame/);
  });

  it("rejects committed content publication with a stale token for the same visible frame id", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    const staleFrame = committedFrame({
      actorGenerations: [committedActor("actor-stale")],
      displayFrameId: 2,
    });
    const nextFrame = committedFrame({ displayFrameId: 2 });

    expect(() =>
      runtime.publishCommittedContentFrame(
        publicationToken(staleFrame),
        nextFrame,
      ),
    ).toThrow(/requires a commit publication token/);
  });
});

function committedFrame({
  actorGenerations = [],
  displayFrameId,
}: {
  readonly actorGenerations?:
    | GpuFlowCommittedSurfaceFrame["actorGenerations"]
    | undefined;
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
    actorGenerations,
    displayFrameId,
    retainedRuntimeFrame: {
      descriptors: {
        domControlSources: [],
        htmlSurfaceNativeVisuals: [],
        nativeDomIslands: [],
      },
      frameId: displayFrameId,
      input: {
        sceneRevision: 1,
        scrollRevision: 0,
        viewport: [0, 0, 1],
      },
    } as unknown as GpuRetainedRuntimeFrame,
    sceneRevision: 1,
    coherence,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      actorGenerations,
      coherence,
      displayFrameId,
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
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function committedActor(
  actorId: string,
): GpuFlowCommittedSurfaceFrame["actorGenerations"][number] {
  return {
    actorFamily: "dom-control",
    actorId,
    browserVisual: null,
    contentGenerationId: `content:${actorId}`,
    generationId: `generation:${actorId}`,
    layoutProjectionGenerationId: `layout:${actorId}`,
    ownerSurfaceId: `surface:${actorId}`,
    textCoverageProof: null,
  } as GpuFlowCommittedSurfaceFrame["actorGenerations"][number];
}

function publicationToken(frame: GpuFlowCommittedSurfaceFrame) {
  return createGpuFlowVisibleFrameCommitPublicationTokenForTest({
    frame,
    projectionSample: {
      id: frame.displayFrameId,
    } as GpuFlowLiveProjectionSample,
  });
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}
