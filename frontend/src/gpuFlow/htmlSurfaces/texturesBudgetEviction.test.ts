/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameCommitPublicationTokenForTest,
} from "../GpuFlow/visibleFrameTestUtils";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "../GpuFlow/visibleFrameTypes";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import {
  releaseGpuFlowRejectedCandidateSurfaceTexture,
  releaseGpuFlowSupersededSurfaceTexture,
  releaseGpuFlowUnmountedSourceSurfaceTexture,
} from "../surfaceTextureReleaseAuthority";
import { HtmlSurfaceTextureManager } from "./textures";
import {
  createGpuTextureMock,
  installTextureUsage,
  registerNode,
} from "./textures.test-helper";

describe("HtmlSurfaceTextureManager upload budgets and eviction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads dirty surfaces by interactive priority within the upload budget", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "prefetch", "prefetch");
    registerNode(manager, "visible", "visible");
    registerNode(manager, "interactive", "interactive");

    const result = manager.uploadDirtySurfaceTextures({
      frame: 4,
      maxUploads: 2,
    });

    expect(result.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "interactive",
      "visible",
    ]);
    expect(result.remainingDirtySurfaceIds).toEqual(["prefetch"]);
    expect(result.budgetExhausted).toBe(true);
    expect(result.workSummary).toMatchObject({
      initialDirtySurfaceCount: 3,
      noUploadReason: null,
      remainingDirtySurfaceCount: 1,
      uploadableRemainingDirtySurfaceCount: 1,
      uploadedSurfaceCount: 2,
    });
  });

  it("reports no dirty work when upload is requested with an empty queue", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    const result = manager.uploadDirtySurfaceTextures({ frame: 1 });

    expect(result).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: [],
      uploaded: [],
      uploadedBytes: 0,
      workSummary: {
        deferredSurfaceCount: 0,
        initialDirtySurfaceCount: 0,
        noUploadReason: "no-dirty-surfaces",
        paintUnavailableSurfaceCount: 0,
        remainingDirtySurfaceCount: 0,
        skippedSurfaceCount: 0,
        uploadableRemainingDirtySurfaceCount: 0,
        uploadedSurfaceCount: 0,
      },
    });
  });

  it("reports upload and skipped bytes when the byte budget leaves dirty surfaces queued", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "first", "visible");
    registerNode(manager, "second", "visible");

    const result = manager.uploadDirtySurfaceTextures({
      frame: 4,
      maxBytes: 400,
    });

    expect(result.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "first",
    ]);
    expect(result.remainingDirtySurfaceIds).toEqual(["second"]);
    expect(result.uploadedBytes).toBe(400);
    expect(result.skippedUploadBytes).toBe(400);
    expect(result.budgetExhausted).toBe(true);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);
  });

  it("keeps a tiled surface upload within the byte budget", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureTileDimension2D: 128,
    });
    const element = document.createElement("div");

    manager.registerSurfaceTexture({
      cssHeight: 128,
      cssWidth: 256,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "settings-like",
      zoom: 1,
    });

    const result = manager.uploadDirtySurfaceTextures({
      frame: 2,
      maxBytes: 128 * 128 * 4,
      maxUploads: 2,
    });

    expect(result).toMatchObject({
      budgetExhausted: true,
      remainingDirtySurfaceIds: ["settings-like"],
      skippedUploadBytes: 128 * 128 * 4,
      uploadedBytes: 128 * 128 * 4,
    });
    expect(manager.getDirtySurfaces()).toMatchObject([
      {
        dirtyTileIds: ["settings-like:1:0"],
        surfaceId: "settings-like",
      },
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);
  });

  it("records texture dimension clamps on the surface texture record", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureDimension2D: 1024,
    });

    const record = manager.registerSurfaceTexture({
      cssHeight: 500,
      cssWidth: 1000,
      devicePixelRatio: 2,
      element: document.createElement("div"),
      surfaceId: "node-a",
      zoom: 4,
    });

    expect(record).toMatchObject({
      clampedByMaxTexture: true,
      maxTextureDimension2D: 1024,
      pixelHeight: 512,
      pixelWidth: 1024,
      requestedScale: 8,
      resolutionScale: 1.024,
      textureBytes: 2_097_152,
      zoomBucket: 4,
    });
  });

  it("reports allocated and visible texture memory from texture dimensions", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "small", "visible", {
      cssHeight: 10,
      cssWidth: 10,
      devicePixelRatio: 1,
    });
    registerNode(manager, "large", "visible", {
      cssHeight: 20,
      cssWidth: 30,
      devicePixelRatio: 2,
    });

    expect(manager.getMemorySnapshot({ visibleSurfaceIds: ["large"] })).toEqual(
      {
        allocatedBytes: 10 * 10 * 4 + 60 * 40 * 4,
        largestTextureBytes: 60 * 40 * 4,
        textureCount: 2,
        visibleBytes: 60 * 40 * 4,
        visibleTextureCount: 1,
      },
    );
  });

  it("evicts offscreen textures by least recent visible frame", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureBytes: 800,
    });

    registerNode(manager, "recent", "visible", { frame: 1 });
    registerNode(manager, "oldest", "visible", { frame: 2 });
    registerNode(manager, "recent", "visible", { frame: 3 });
    registerNode(manager, "newest", "visible", { frame: 4 });

    const result = manager.evictSurfaceTextures();

    expect(result).toMatchObject({
      budgetBytes: 800,
      evictedBytes: 400,
      evictedSurfaceIds: ["oldest"],
      overBudgetBytes: 0,
      reason: "memory-budget",
    });
    expect(result.memoryBefore).toMatchObject({
      allocatedBytes: 1_200,
      textureCount: 3,
    });
    expect(result.memory).toMatchObject({
      allocatedBytes: 800,
      textureCount: 2,
    });
    expect(manager.getCommittedSurfaceTexture("oldest")).toBeUndefined();
    expect(gpu.textures[1]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("protects visible, explicit, interactive, and dirty-interactive records while evicting", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureBytes: 400,
    });

    registerNode(manager, "visible", "visible", { frame: 1 });
    registerNode(manager, "explicit", "visible", { frame: 2 });
    registerNode(manager, "interactive", "interactive", { frame: 3 });
    registerNode(manager, "dirty-interactive", "visible", { frame: 4 });
    registerNode(manager, "candidate", "visible", { frame: 5 });
    manager.markSurfaceTextureDirty({
      content: true,
      surfaceId: "dirty-interactive",
      priority: "interactive",
      reason: "input",
    });

    const result = manager.evictSurfaceTextures({
      protectedSurfaceIds: ["explicit"],
      visibleSurfaceIds: ["visible"],
    });

    expect(result.evictedSurfaceIds).toEqual(["candidate"]);
    expect(result.memory).toMatchObject({
      allocatedBytes: 1_600,
      textureCount: 4,
      visibleBytes: 400,
      visibleTextureCount: 1,
    });
    expect(result.overBudgetBytes).toBe(1_200);
    expect(result.protectedSurfaceIds).toEqual([
      "dirty-interactive",
      "explicit",
      "interactive",
      "visible",
    ]);
    expect(manager.getCommittedSurfaceTexture("candidate")).toBeUndefined();
    expect(manager.getCommittedSurfaceTexture("visible")).toBeDefined();
    expect(manager.getCommittedSurfaceTexture("explicit")).toBeDefined();
    expect(manager.getCommittedSurfaceTexture("interactive")).toBeDefined();
    expect(
      manager.getCommittedSurfaceTexture("dirty-interactive"),
    ).toBeDefined();
  });

  it("destroys individual and retained surface textures", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "node-a", "visible");
    registerNode(manager, "node-b", "visible");

    expect(
      releaseGpuFlowUnmountedSourceSurfaceTexture({
        surfaceId: "node-a",
        textureManager: manager,
      }),
    ).toEqual({
      kind: "released",
      surfaceId: "node-a",
    });
    expect(gpu.textures[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getCommittedSurfaceTexture("node-a")).toBeUndefined();

    manager.destroy();
    expect(gpu.textures[1]?.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getDirtySurfaces()).toEqual([]);
  });

  it("rejects unbranded direct texture release tokens", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "node-a", "visible");

    expect(() =>
      manager.destroySurfaceTexture(
        {
          reason: "test",
          surfaceId: "node-a",
          transactionId: "fake",
        } as never,
        "node-a",
      ),
    ).toThrow(
      'GPU Flow surface texture release requires a release token for surface "node-a".',
    );
    expect(manager.getCommittedSurfaceTexture("node-a")).toBeDefined();
  });

  it("uses outcome-specific publication tokens for transaction-owned release", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const commitToken = createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame: committedSurfaceFrame(4),
      projectionSample: projectionSample(9),
    });
    const blockedToken = createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
      blockedReasons: [
        {
          actorId: "candidate-a",
          family: "dom-control",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
      projectionSample: projectionSample(10),
    });

    registerNode(manager, "superseded", "visible");
    registerNode(manager, "rejected", "visible");

    expect(
      releaseGpuFlowSupersededSurfaceTexture({
        surfaceId: "superseded",
        textureManager: manager,
        token: commitToken,
      }),
    ).toEqual({
      kind: "released",
      surfaceId: "superseded",
    });
    expect(
      releaseGpuFlowRejectedCandidateSurfaceTexture({
        surfaceId: "rejected",
        textureManager: manager,
        token: blockedToken,
      }),
    ).toEqual({
      kind: "released",
      surfaceId: "rejected",
    });
    expect(() =>
      releaseGpuFlowSupersededSurfaceTexture({
        surfaceId: "rejected",
        textureManager: manager,
        token: blockedToken as never,
      }),
    ).toThrow(/commit publication token/);
  });

  it("preserves previous-frame textures when blocked publication releases rejected candidates", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const blockedToken = createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
      blockedReasons: [
        {
          actorId: "candidate",
          family: "dom-control",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: 4,
      projectionSample: projectionSample(10),
    });

    registerNode(manager, "previous", "visible", { frame: 4 });
    registerNode(manager, "candidate", "visible", { frame: 5 });
    manager.evictSurfaceTextures({
      budgetBytes: Number.POSITIVE_INFINITY,
      protectedSurfaceIds: ["previous"],
    });

    expect(
      releaseGpuFlowRejectedCandidateSurfaceTexture({
        surfaceId: "candidate",
        textureManager: manager,
        token: blockedToken,
      }),
    ).toEqual({
      kind: "released",
      surfaceId: "candidate",
    });
    expect(manager.getCommittedSurfaceTexture("candidate")).toBeUndefined();
    expect(manager.getCommittedSurfaceTexture("previous")).toBeDefined();
    expect(gpu.textures[0]?.destroy).not.toHaveBeenCalled();
    expect(gpu.textures[1]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("defers source texture release while a published frame protects the surface", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "node-a", "visible", { frame: 1 });
    manager.evictSurfaceTextures({
      budgetBytes: Number.POSITIVE_INFINITY,
      protectedSurfaceIds: ["node-a"],
    });

    expect(
      releaseGpuFlowUnmountedSourceSurfaceTexture({
        surfaceId: "node-a",
        textureManager: manager,
      }),
    ).toEqual({
      kind: "deferred-protected",
      surfaceId: "node-a",
    });
    expect(gpu.textures[0]?.destroy).not.toHaveBeenCalled();
    expect(manager.getCommittedSurfaceTexture("node-a")).toBeDefined();

    manager.evictSurfaceTextures({
      budgetBytes: Number.POSITIVE_INFINITY,
      protectedSurfaceIds: [],
    });

    expect(gpu.textures[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getCommittedSurfaceTexture("node-a")).toBeUndefined();
  });

  it("cancels deferred release when the source remounts before protection clears", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "node-a", "visible", { frame: 1 });
    manager.evictSurfaceTextures({
      budgetBytes: Number.POSITIVE_INFINITY,
      protectedSurfaceIds: ["node-a"],
    });
    releaseGpuFlowUnmountedSourceSurfaceTexture({
      surfaceId: "node-a",
      textureManager: manager,
    });

    registerNode(manager, "node-a", "visible", { frame: 2 });
    manager.evictSurfaceTextures({
      budgetBytes: Number.POSITIVE_INFINITY,
      protectedSurfaceIds: [],
    });

    expect(gpu.textures[0]?.destroy).not.toHaveBeenCalled();
    expect(manager.getCommittedSurfaceTexture("node-a")).toBeDefined();
  });
});

function committedSurfaceFrame(
  displayFrameId: number,
): GpuFlowCommittedSurfaceFrame {
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

function projectionSample(id: number): GpuFlowLiveProjectionSample {
  return {
    id,
  } as GpuFlowLiveProjectionSample;
}
