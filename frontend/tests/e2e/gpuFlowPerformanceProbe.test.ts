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
    expect(summary.latestNodeLayerFrame?.drawnNodeCount).toBe(3);
  });

  it("injects a self-contained browser probe that records real wrapper calls", () => {
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
    expect(snapshot?.nodeLayerFrames[0]).toMatchObject({
      activeNodeId: "node-a",
      drawnEdgeCount: 1,
      drawnNodeCount: 1,
      uploadedNodeIds: ["node-a"],
      visibleNodeCount: 2,
    });
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
    missingElementNodeCount: 0,
    missingTextureNodeCount: 0,
    remainingDirtyNodeCount: 0,
    skippedNodeCount: 0,
    timestampMs: 0,
    uploadedNodeIds: [],
    visibleNodeCount: 0,
    ...overrides,
  };
}

function getInstalledProbeApi():
  | {
      recordNodeLayerFrame(result: unknown): void;
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
          snapshot(): GpuFlowPerformanceSnapshot;
          uninstall(): void;
        }
      >
  )[GPU_FLOW_PERFORMANCE_PROBE_KEY];
}
