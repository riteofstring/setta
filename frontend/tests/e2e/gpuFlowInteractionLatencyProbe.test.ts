/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuFlowInteractionLatencyProbeInitScript,
  GPU_FLOW_INTERACTION_LATENCY_PROBE_KEY,
  summarizeGpuFlowInteractionLatencyOperations,
  type BeginGpuFlowInteractionLatencySampleInput,
  type GpuFlowInteractionLatencySample,
} from "./gpuFlowInteractionLatencyProbe";
import type { GpuFlowPerformanceSnapshot } from "./gpuFlowPerformanceProbe";

describe("GPU flow interaction latency probe helpers", () => {
  afterEach(() => {
    getInstalledProbeApi()?.uninstall();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("captures first input to visible DOM response timing in the page", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        window.setTimeout(() => callback(performance.now()), 0);
        return 1;
      },
    );
    window.eval(createGpuFlowInteractionLatencyProbeInitScript());
    const button = document.createElement("button");
    button.id = "toggle";
    button.setAttribute("aria-pressed", "false");
    document.body.append(button);
    const api = requireInstalledProbeApi();
    const input = {
      response: {
        expectedValue: "true",
        kind: "attribute",
        name: "aria-pressed",
      },
      sampleId: "toggle-latency",
      startEvents: ["pointerdown"],
      targetSelector: "#toggle",
      timeoutMs: 250,
    } satisfies BeginGpuFlowInteractionLatencySampleInput;
    const sampleId = api.begin(input);
    button.addEventListener("pointerdown", () => {
      button.setAttribute("aria-pressed", "mixed");
      window.setTimeout(() => {
        button.setAttribute("aria-pressed", "true");
      }, 0);
    });

    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const sample = await api.wait(sampleId, 500);

    expect(sample).toMatchObject({
      endResponseValue: "true",
      id: "toggle-latency",
      responseSelector: null,
      startEventType: "pointerdown",
      startResponseValue: "false",
      targetSelector: "#toggle",
    });
    expect(sample.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("summarizes upload, buffer, and long-task counts for the interaction window", () => {
    const sample: GpuFlowInteractionLatencySample = {
      endResponseValue: "typed",
      id: "text-latency",
      latencyMs: 12,
      responseSelector: null,
      responseTimeMs: 112,
      startEventType: "beforeinput",
      startResponseValue: "",
      startTimeMs: 100,
      targetSelector: "#text",
    };
    const snapshot: GpuFlowPerformanceSnapshot = {
      frameCount: 4,
      frameIntervalsMs: [16, 17, 16],
      installedAtMs: 0,
      longTasks: [
        { durationMs: 54, name: "self", startTimeMs: 130 },
        { durationMs: 80, name: "self", startTimeMs: 220 },
      ],
      nodeLayerFrames: [],
      queueCalls: [
        {
          height: 80,
          index: 0,
          method: "copyElementImageToTexture",
          sourceInteractive: true,
          sourceNodeId: "node-a",
          timestampMs: 108,
          width: 120,
        },
        {
          height: 80,
          index: 1,
          method: "copyElementImageToTexture",
          sourceInteractive: false,
          sourceNodeId: "node-b",
          timestampMs: 118,
          width: 120,
        },
        {
          bufferLabel: "setta-gpu-node-quad-camera-uniform",
          byteLength: 32,
          index: 2,
          method: "writeBuffer",
          timestampMs: 122,
        },
        {
          height: 80,
          index: 3,
          method: "copyElementImageToTexture",
          sourceInteractive: true,
          sourceNodeId: "node-a",
          timestampMs: 150,
          width: 120,
        },
      ],
      queueWrappersInstalled: true,
      timestampMs: 180,
    };

    expect(
      summarizeGpuFlowInteractionLatencyOperations(sample, snapshot, {
        endTimeMs: 180,
        nodeId: "node-a",
      }),
    ).toEqual({
      activeTextureUploadsBeforeResponse: 1,
      durationMs: 80,
      longTasks: {
        count: 1,
        worstDurationMs: 54,
      },
      nodeTextureUploadsAfterResponse: 1,
      nodeTextureUploadsBeforeResponse: 1,
      nodeTextureUploadsTotal: 2,
      textureUploadsTotal: 3,
      writeBufferCalls: 1,
      writeBufferCallsByLabel: {
        "setta-gpu-node-quad-camera-uniform": 1,
      },
    });
  });
});

function getInstalledProbeApi():
  | {
      begin(input: BeginGpuFlowInteractionLatencySampleInput): string;
      uninstall(): void;
      wait(
        sampleId: string,
        timeoutMs: number,
      ): Promise<GpuFlowInteractionLatencySample>;
    }
  | undefined {
  return (
    window as Window &
      Record<
        string,
        {
          begin(input: BeginGpuFlowInteractionLatencySampleInput): string;
          uninstall(): void;
          wait(
            sampleId: string,
            timeoutMs: number,
          ): Promise<GpuFlowInteractionLatencySample>;
        }
      >
  )[GPU_FLOW_INTERACTION_LATENCY_PROBE_KEY];
}

function requireInstalledProbeApi(): NonNullable<
  ReturnType<typeof getInstalledProbeApi>
> {
  const api = getInstalledProbeApi();
  if (!api) {
    throw new Error("Expected installed GPU flow interaction latency probe.");
  }
  return api;
}
