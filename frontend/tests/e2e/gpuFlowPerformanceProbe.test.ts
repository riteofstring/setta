/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuFlowPerformanceProbeInitScript,
  GPU_FLOW_PERFORMANCE_PROBE_KEY,
  summarizeGpuFlowPerformanceSnapshot,
  type GpuFlowPerformanceSnapshot,
} from "./gpuFlowPerformanceProbe";

describe("GPU flow performance probe helpers", () => {
  afterEach(() => {
    const api = getInstalledProbeApi();
    api?.uninstall();
    delete (window as unknown as Record<string, unknown>).GPUQueue;
    delete (HTMLCanvasElement.prototype as { requestPaint?: unknown })
      .requestPaint;
    vi.unstubAllGlobals();
  });

  it("summarizes frame timing, long tasks, queue operations, and node-layer frames", () => {
    const snapshot: GpuFlowPerformanceSnapshot = {
      frameCount: 4,
      frameIntervalsMs: [16, 18, 16],
      installedAtMs: 100,
      longTasks: [
        { durationMs: 51, name: "self", startTimeMs: 120 },
        { durationMs: 72, name: "self", startTimeMs: 240 },
      ],
      nodeLayerFrames: [
        nodeLayerFrame({ drawnNodeCount: 2, uploadedNodeIds: ["node-a"] }),
        nodeLayerFrame({ drawnNodeCount: 3, uploadedNodeIds: [] }),
      ],
      performanceMeasures: [],
      queueCalls: [
        {
          height: 80,
          index: 0,
          method: "copyElementImageToTexture",
          sourceInteractive: true,
          sourceNodeId: "node-a",
          timestampMs: 150,
          width: 120,
        },
        {
          height: 64,
          index: 1,
          method: "copyElementImageToTexture",
          sourceInteractive: false,
          sourceNodeId: "node-b",
          timestampMs: 170,
          width: 90,
        },
        {
          index: 2,
          method: "copyElementImageToTexture",
          timestampMs: 180,
        },
        {
          bufferLabel: "setta-gpu-node-quad-camera-uniform",
          byteLength: 32,
          index: 3,
          method: "writeBuffer",
          timestampMs: 190,
        },
        {
          bufferLabel: "setta-gpu-node-quad-camera-uniform",
          byteLength: 32,
          index: 4,
          method: "writeBuffer",
          timestampMs: 210,
        },
        {
          bufferLabel: "setta-gpu-node-quad-vertices",
          byteLength: 96,
          index: 5,
          method: "writeBuffer",
          timestampMs: 220,
        },
      ],
      queueWrappersInstalled: true,
      rafCallbacks: [],
      requestPaintCalls: [{ index: 0, timestampMs: 225 }],
      sourceMutations: [
        {
          attributeName: "style",
          index: 0,
          sourceNodeId: "node-a",
          timestampMs: 230,
          transformChanged: true,
        },
        {
          attributeName: "class",
          index: 1,
          sourceNodeId: "node-b",
          timestampMs: 235,
          transformChanged: false,
        },
      ],
      timestampMs: 350,
    };

    const summary = summarizeGpuFlowPerformanceSnapshot(snapshot);

    expect(summary.durationMs).toBe(250);
    expect(summary.frame.count).toBe(4);
    expect(summary.frame.averageIntervalMs).toBeCloseTo(50 / 3);
    expect(summary.frame.averageFps).toBeCloseTo(60);
    expect(summary.frame.worstIntervalMs).toBe(18);
    expect(summary.longTasks).toEqual({
      count: 2,
      worstDurationMs: 72,
    });
    expect(summary.queue).toEqual({
      activeTextureUploads: 1,
      passiveTextureUploads: 1,
      textureUploads: 3,
      textureUploadsByNodeId: {
        "node-a": 1,
        "node-b": 1,
      },
      unknownTextureUploads: 1,
      writeBufferBytesByLabel: {
        "setta-gpu-node-quad-camera-uniform": 64,
        "setta-gpu-node-quad-vertices": 96,
      },
      writeBufferCalls: 3,
      writeBufferCallsByLabel: {
        "setta-gpu-node-quad-camera-uniform": 2,
        "setta-gpu-node-quad-vertices": 1,
      },
    });
    expect(summary.requestPaintCalls).toBe(1);
    expect(summary.sourceMutations).toEqual({
      total: 2,
      transformWrites: 1,
    });
    expect(summary.latestNodeLayerFrame?.drawnNodeCount).toBe(3);
  });

  it("injects a self-contained browser probe that records real wrapper calls", async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    class FakeGPUQueue {
      copyElementImageToTexture() {}
      writeBuffer() {}
    }
    Object.defineProperty(window, "GPUQueue", {
      configurable: true,
      value: FakeGPUQueue,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "requestPaint", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });

    window.eval(createGpuFlowPerformanceProbeInitScript());
    const nodeElement = document.createElement("div");
    nodeElement.dataset.gpuFlowNode = "true";
    nodeElement.dataset.gpuFlowInteractive = "true";
    nodeElement.dataset.id = "node-a";
    const childElement = document.createElement("button");
    nodeElement.append(childElement);
    document.body.append(nodeElement);

    const queue = new FakeGPUQueue() as FakeGPUQueue & {
      copyElementImageToTexture(
        source: Element,
        width: number,
        height: number,
        destination: unknown,
      ): void;
      writeBuffer(
        buffer: { label: string },
        offset: number,
        data: ArrayBuffer,
      ): void;
    };
    queue.copyElementImageToTexture(childElement, 120, 80, { texture: {} });
    queue.writeBuffer(
      { label: "setta-gpu-node-quad-camera-uniform" },
      0,
      new ArrayBuffer(32),
    );
    requestAnimationFrame(() => {});
    rafCallbacks[0]?.(10);
    requestAnimationFrame(() => {});
    rafCallbacks[1]?.(26);
    (
      document.createElement("canvas") as HTMLCanvasElement & {
        requestPaint(): void;
      }
    ).requestPaint();
    nodeElement.style.transform = "translate(10px, 20px)";
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    getInstalledProbeApi()?.recordNodeLayerFrame({
      activeNodeId: "node-a",
      budgetExhausted: false,
      drawnEdgeIds: ["edge-a"],
      drawnNodeIds: ["node-a"],
      edgeVertexCount: 2,
      missingElementNodeIds: [],
      missingTextureNodeIds: [],
      remainingDirtyNodeIds: [],
      skippedNodeIds: [],
      phaseDiagnostics: {
        frameMode: "projection",
        htmlSurfaceFrameMs: 1,
      },
      projectionDiagnostics: {
        committedFrameId: 17,
        gestureOwner: "ownedByRetainedSectionScroll",
        heldPreviousDurationMs: 12,
        heldPreviousFrameCount: 2,
        heldPreviousOverBudget: false,
        heldPreviousReason: "retained-projection-coverage-missing",
        heldPreviousRequestedSampleId: 23,
        lane: "motion",
        sampleId: 19,
        transactionId: "motion-projection:content-17:sample-19",
        transactionKind: "motion-projection",
      },
      evictedTextureBytes: 400,
      evictedTextureNodeIds: ["offscreen"],
      textureMemory: {
        allocatedBytes: 800,
        largestTextureBytes: 400,
        textureCount: 2,
        visibleBytes: 400,
        visibleTextureCount: 1,
      },
      uploadedNodeIds: ["node-a", 7],
      visibleNodeIds: ["node-a", "node-b"],
    });

    const snapshot = getInstalledProbeApi()?.snapshot();

    expect(snapshot?.queueWrappersInstalled).toBe(true);
    expect(snapshot?.queueCalls).toEqual([
      expect.objectContaining({
        height: 80,
        method: "copyElementImageToTexture",
        sourceInteractive: true,
        sourceNodeId: "node-a",
        width: 120,
      }),
      expect.objectContaining({
        bufferLabel: "setta-gpu-node-quad-camera-uniform",
        byteLength: 32,
        method: "writeBuffer",
      }),
    ]);
    expect(snapshot?.frameCount).toBe(2);
    expect(snapshot?.frameIntervalsMs).toEqual([16]);
    expect(snapshot?.rafCallbacks).toEqual([
      expect.objectContaining({
        durationMs: expect.any(Number),
        index: 0,
        startedAtMs: expect.any(Number),
      }),
      expect.objectContaining({
        durationMs: expect.any(Number),
        index: 1,
        startedAtMs: expect.any(Number),
      }),
    ]);
    expect(snapshot?.requestPaintCalls).toHaveLength(1);
    expect(snapshot?.sourceMutations).toEqual([
      expect.objectContaining({
        attributeName: "style",
        sourceNodeId: "node-a",
        transformChanged: true,
      }),
    ]);
    expect(snapshot?.nodeLayerFrames[0]).toMatchObject({
      activeNodeId: "node-a",
      drawnEdgeCount: 1,
      drawnNodeCount: 1,
      evictedTextureBytes: 400,
      evictedTextureNodeIds: ["offscreen"],
      textureAllocatedBytes: 800,
      textureCount: 2,
      textureLargestBytes: 400,
      textureVisibleBytes: 400,
      projectionDiagnostics: {
        committedFrameId: 17,
        gestureOwner: "ownedByRetainedSectionScroll",
        heldPreviousDurationMs: 12,
        heldPreviousFrameCount: 2,
        heldPreviousOverBudget: false,
        heldPreviousReason: "retained-projection-coverage-missing",
        heldPreviousRequestedSampleId: 23,
        lane: "motion",
        sampleId: 19,
        transactionId: "motion-projection:content-17:sample-19",
        transactionKind: "motion-projection",
      },
      uploadedNodeIds: ["node-a"],
      visibleNodeCount: 2,
    });
  });

  it("can disable source mutation recording for narrow frame probes", async () => {
    window.eval(createGpuFlowPerformanceProbeInitScript());
    const api = getInstalledProbeApi();
    expect(api).toBeDefined();
    const nodeElement = document.createElement("div");
    nodeElement.dataset.gpuFlowNode = "true";
    document.body.append(nodeElement);

    api?.setSourceMutationRecording(false);
    nodeElement.style.transform = "translate(10px, 20px)";
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(api?.snapshot().sourceMutations).toEqual([]);

    api?.setSourceMutationRecording(true);
    nodeElement.style.transform = "translate(20px, 30px)";
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(api?.snapshot().sourceMutations).toEqual([
      expect.objectContaining({
        attributeName: "style",
        transformChanged: true,
      }),
    ]);
  });
});

function nodeLayerFrame(
  overrides: Partial<
    GpuFlowPerformanceSnapshot["nodeLayerFrames"][number]
  > = {},
): GpuFlowPerformanceSnapshot["nodeLayerFrames"][number] {
  return {
    activeNodeId: null,
    budgetExhausted: false,
    drawnEdgeCount: 0,
    drawnNodeCount: 0,
    edgeVertexCount: 0,
    evictedTextureBytes: 0,
    evictedTextureNodeIds: [],
    frameReasons: [],
    missingElementNodeCount: 0,
    missingTextureNodeCount: 0,
    phaseDiagnostics: {
      committedContentPublishMs: 0,
      diagnosticsMs: 0,
      domTextActorProjectionMs: 0,
      frameMode: "projection",
      htmlSurfaceFrameMs: 0,
      projectionSurfaceResolveMs: 0,
      retainedDisplayTransactionMs: 0,
      retainedPageFrameMs: 0,
      retainedPageMaintenanceMs: 0,
      retainedRuntimeFrameMs: 0,
      schedulingMs: 0,
    },
    projectionDiagnostics: {
      committedFrameId: null,
      gestureOwner: null,
      heldPreviousDurationMs: 0,
      heldPreviousFrameCount: 0,
      heldPreviousOverBudget: false,
      heldPreviousReason: null,
      heldPreviousRequestedSampleId: null,
      lane: null,
      sampleId: null,
      transactionId: null,
      transactionKind: null,
    },
    remainingDirtyNodeCount: 0,
    retainedTexturePageCoverageCandidateCount: 0,
    retainedTexturePageDrawQuadCount: 0,
    retainedTexturePageRasterMs: 0,
    retainedTexturePageTargetDescriptorCount: 0,
    retainedTexturePageTransactionOutcome: "",
    retainedTexturePageUploadCount: 0,
    retainedTexturePageUploadMs: 0,
    skippedNodeCount: 0,
    solidRoundedRectSurfaceCount: 0,
    textureAllocatedBytes: 0,
    textureCount: 0,
    textureLargestBytes: 0,
    textureVisibleBytes: 0,
    timestampMs: 0,
    uploadDiagnostics: [],
    uploadedNodeIds: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    visibleNodeCount: 0,
    ...overrides,
  };
}

function getInstalledProbeApi():
  | {
      recordNodeLayerFrame(result: unknown): void;
      setSourceMutationRecording(enabled: boolean): void;
      snapshot(): GpuFlowPerformanceSnapshot;
      uninstall(): void;
    }
  | undefined {
  return (
    window as Window &
      Record<
        string,
        {
          recordNodeLayerFrame(result: unknown): void;
          setSourceMutationRecording(enabled: boolean): void;
          snapshot(): GpuFlowPerformanceSnapshot;
          uninstall(): void;
        }
      >
  )[GPU_FLOW_PERFORMANCE_PROBE_KEY];
}
