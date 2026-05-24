import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import { createGpuFlowVisibleFramePresentationTokenForTest } from "./GpuFlow/visibleFrameTestUtils";
import { createGpuFlowPresentedSurfaceRuntime } from "./presentedSurfaceRuntime";
import type { GpuFlowLiveProjectionSample } from "./projectionRuntime";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";

describe("GPU Flow presented surface runtime", () => {
  it("notifies presented-frame subscribers synchronously while deferring React semantic observers", async () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowPresentedSurfaceRuntime(startupFrame);
    const nextFrame = committedFrame({
      actorGenerations: [committedActor("actor-next")],
      displayFrameId: 2,
    });
    const notifications: string[] = [];
    runtime.subscribePresentedContentFrame(() => {
      notifications.push(
        `presented:${runtime.getPresentedContentFrame().displayFrameId}`,
      );
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      notifications.push(
        `semantic:${runtime.getReactSemanticSnapshot().frame.displayFrameId}`,
      );
    });

    const token = publicationToken(nextFrame);
    expect(runtime.publishPresentedContentFrame(token, nextFrame)).toBe(true);

    expect(runtime.getPresentedContentFrame()).toBe(nextFrame);
    expect(runtime.getReactSemanticSnapshot().frame).toBe(nextFrame);
    expect(runtime.getReactSemanticSnapshot().presentationIdentity).toEqual({
      contentFrameId: token.contentFrameId,
      presentationId: token.presentationId,
      projectionSampleId: token.projectionSampleId,
    });
    expect(notifications).toEqual(["presented:2"]);

    await nextMicrotask();

    expect(notifications).toEqual(["presented:2", "semantic:2"]);
  });

  it("coalesces React semantic observers behind the latest presented frame", async () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowPresentedSurfaceRuntime(startupFrame);
    const firstFrame = committedFrame({
      actorGenerations: [committedActor("actor-first")],
      displayFrameId: 2,
    });
    const secondFrame = committedFrame({
      actorGenerations: [committedActor("actor-second")],
      displayFrameId: 3,
    });
    const presentedFrameIds: number[] = [];
    const semanticFrameIds: number[] = [];
    runtime.subscribePresentedContentFrame(() => {
      presentedFrameIds.push(runtime.getPresentedContentFrame().displayFrameId);
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      semanticFrameIds.push(
        runtime.getReactSemanticSnapshot().frame.displayFrameId,
      );
    });

    expect(
      runtime.publishPresentedContentFrame(
        publicationToken(firstFrame),
        firstFrame,
      ),
    ).toBe(true);
    expect(
      runtime.publishPresentedContentFrame(
        publicationToken(secondFrame),
        secondFrame,
      ),
    ).toBe(true);

    expect(runtime.getPresentedContentFrame()).toBe(secondFrame);
    expect(presentedFrameIds).toEqual([2, 3]);
    expect(semanticFrameIds).toEqual([]);

    await nextMicrotask();

    expect(semanticFrameIds).toEqual([3]);
  });

  it("keeps deferred React semantic updates pending until a subscriber attaches", async () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowPresentedSurfaceRuntime(startupFrame);
    const nextFrame = committedFrame({
      actorGenerations: [committedActor("actor-next")],
      displayFrameId: 2,
    });

    expect(
      runtime.publishPresentedContentFrame(
        publicationToken(nextFrame),
        nextFrame,
      ),
    ).toBe(true);
    await nextMicrotask();

    const semanticFrameIds: number[] = [];
    runtime.subscribeReactSemanticSnapshot(() => {
      semanticFrameIds.push(
        runtime.getReactSemanticSnapshot().frame.displayFrameId,
      );
    });

    expect(semanticFrameIds).toEqual([]);
    await nextMicrotask();
    expect(semanticFrameIds).toEqual([2]);
  });

  it("notifies presented-frame subscribers for render-signature deduped frames", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowPresentedSurfaceRuntime(startupFrame);
    let presentedFrameUpdates = 0;
    let semanticUpdates = 0;
    runtime.subscribePresentedContentFrame(() => {
      presentedFrameUpdates += 1;
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      semanticUpdates += 1;
    });

    const transformOnlyFrame = committedFrame({ displayFrameId: 2 });
    const token = publicationToken(transformOnlyFrame);
    expect(
      runtime.publishPresentedContentFrame(token, transformOnlyFrame),
    ).toBe(false);

    expect(runtime.getPresentedContentFrame()).toBe(transformOnlyFrame);
    expect(runtime.getReactSemanticSnapshot().frame).toBe(startupFrame);
    expect(runtime.getReactSemanticSnapshot().presentationIdentity).toEqual({
      contentFrameId: token.contentFrameId,
      presentationId: token.presentationId,
      projectionSampleId: token.projectionSampleId,
    });
    expect(presentedFrameUpdates).toBe(1);
    expect(semanticUpdates).toBe(0);
  });

  it("advances React semantic presentation metadata for motion-only commits", async () => {
    const frame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowPresentedSurfaceRuntime(frame);
    const contentToken = publicationToken(frame);
    const motionToken = publicationTokenForSample(frame, 2);
    const presentationIds: string[] = [];
    runtime.subscribeReactSemanticSnapshot(() => {
      const identity = runtime.getReactSemanticSnapshot().presentationIdentity;
      if (identity !== null) {
        presentationIds.push(String(identity.presentationId));
      }
    });

    expect(runtime.publishPresentedContentFrame(contentToken, frame)).toBe(
      false,
    );
    expect(runtime.publishPresentedProjectionIdentity(motionToken)).toBe(true);

    expect(runtime.getPresentedContentFrame()).toBe(frame);
    expect(runtime.getReactSemanticSnapshot().presentationIdentity).toEqual({
      contentFrameId: motionToken.contentFrameId,
      presentationId: motionToken.presentationId,
      projectionSampleId: motionToken.projectionSampleId,
    });

    await nextMicrotask();

    expect(presentationIds).toEqual([String(motionToken.presentationId)]);
  });

  it("rejects presented content publication with a token for a different visible frame", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowPresentedSurfaceRuntime(startupFrame);
    const nextFrame = committedFrame({ displayFrameId: 2 });

    expect(() =>
      runtime.publishPresentedContentFrame(
        publicationToken(startupFrame),
        nextFrame,
      ),
    ).toThrow(/requires a visible frame presentation token/);
  });

  it("does not expose reset or startup lifecycle mutators", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowPresentedSurfaceRuntime(startupFrame);

    expect("resetPresentedContentFrame" in runtime).toBe(false);
    expect("setStartupFrame" in runtime).toBe(false);
  });

  it("rejects presented content publication with a stale token for the same visible frame id", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowPresentedSurfaceRuntime(startupFrame);
    const staleFrame = committedFrame({
      actorGenerations: [committedActor("actor-stale")],
      displayFrameId: 2,
    });
    const nextFrame = committedFrame({ displayFrameId: 2 });

    expect(() =>
      runtime.publishPresentedContentFrame(
        publicationToken(staleFrame),
        nextFrame,
      ),
    ).toThrow(/requires a visible frame presentation token/);
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
        renderedSceneNodeIds: [],
        sceneSections: [],
        sourceSurfaces: [],
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
  return publicationTokenForSample(frame, frame.displayFrameId);
}

function publicationTokenForSample(
  frame: GpuFlowCommittedSurfaceFrame,
  sampleId: number,
) {
  return createGpuFlowVisibleFramePresentationTokenForTest({
    frame,
    projectionSample: {
      id: sampleId,
    } as GpuFlowLiveProjectionSample,
  });
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}
