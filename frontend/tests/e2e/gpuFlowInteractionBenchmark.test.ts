/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  percentile,
  summarizeGpuFlowInteractionBenchmark,
  summarizeNumberSeries,
} from "./gpuFlowInteractionBenchmark";
import type { GpuFlowPerformanceSnapshot } from "./gpuFlowPerformanceProbe";

describe("GPU flow interaction benchmark helpers", () => {
  it("summarizes percentile timing with nearest-rank semantics", () => {
    const values = [20, 5, 40, 10, 30];

    expect(percentile(values, 0)).toBe(5);
    expect(percentile(values, 0.5)).toBe(20);
    expect(percentile(values, 0.95)).toBe(40);
    expect(percentile(values, 1)).toBe(40);
    expect(summarizeNumberSeries(values)).toEqual({
      average: 21,
      count: 5,
      p50: 20,
      p95: 40,
      p99: 40,
      worst: 40,
    });
  });

  it("summarizes benchmark work inside the interaction window", () => {
    const snapshot: GpuFlowPerformanceSnapshot = {
      frameCount: 5,
      frameIntervalsMs: [16, 18, 40, 17],
      installedAtMs: 90,
      longTasks: [
        { durationMs: 60, name: "self", startTimeMs: 150 },
        { durationMs: 75, name: "self", startTimeMs: 320 },
      ],
      nodeLayerFrames: [
        {
          activeNodeId: "section-a",
          budgetExhausted: false,
          drawnEdgeCount: 2,
          drawnNodeCount: 3,
          edgeVertexCount: 8,
          evictedTextureBytes: 0,
          evictedTextureNodeIds: [],
          missingElementNodeCount: 0,
          missingTextureNodeCount: 0,
          remainingDirtyNodeCount: 1,
          skippedNodeCount: 0,
          textureAllocatedBytes: 1024,
          textureCount: 2,
          textureLargestBytes: 768,
          textureVisibleBytes: 1024,
          timestampMs: 210,
          uploadedNodeIds: ["section-a"],
          visibleNodeCount: 3,
        },
      ],
      queueCalls: [
        {
          height: 50,
          index: 0,
          method: "copyElementImageToTexture",
          sourceNodeId: "before-window",
          timestampMs: 95,
          width: 50,
        },
        {
          height: 80,
          index: 1,
          method: "copyElementImageToTexture",
          sourceNodeId: "section-a",
          timestampMs: 130,
          width: 120,
        },
        {
          bufferLabel: "setta-gpu-node-quad-camera-uniform",
          byteLength: 32,
          index: 2,
          method: "writeBuffer",
          timestampMs: 145,
        },
      ],
      queueWrappersInstalled: true,
      requestPaintCalls: [
        { index: 0, timestampMs: 135 },
        { index: 1, timestampMs: 400 },
      ],
      sourceMutations: [
        {
          attributeName: "style",
          index: 0,
          sourceNodeId: "section-a",
          timestampMs: 136,
          transformChanged: true,
        },
        {
          attributeName: "class",
          index: 1,
          sourceNodeId: "section-b",
          timestampMs: 138,
          transformChanged: false,
        },
      ],
      timestampMs: 220,
    };

    expect(
      summarizeGpuFlowInteractionBenchmark({
        durableMutationCount: 1,
        scenario: "top-level-section-resize",
        snapshot,
        startTimeMs: 100,
      }),
    ).toMatchObject({
      dirty: {
        remainingDirtyNodeCount: 1,
        sourceRectCount: null,
        sourceRectTotalArea: null,
      },
      durableMutationCount: 1,
      frameIntervalsMs: {
        count: 4,
        p50: 17,
        p95: 40,
        p99: 40,
        worst: 40,
      },
      longTasks: {
        count: 1,
        totalDurationMs: 60,
        worstDurationMs: 60,
      },
      queue: {
        textureUploadBytes: 38400,
        textureUploads: 1,
        textureUploadsByNodeId: { "section-a": 1 },
        writeBufferCalls: 1,
        writeBufferCallsByLabel: {
          "setta-gpu-node-quad-camera-uniform": 1,
        },
      },
      reactCommitCount: null,
      requestPaintCalls: 1,
      scenario: "top-level-section-resize",
      sourceMutations: {
        total: 2,
        transformWrites: 1,
      },
    });
  });
});
