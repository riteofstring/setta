/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureGpuFlowVisualParitySnapshotForElement,
  compareGpuFlowVisualParityPixelRegions,
  compareGpuFlowVisualParitySnapshots,
  createGpuFlowVisualParityProbeInitScript,
  GPU_FLOW_VISUAL_PARITY_PROBE_KEY,
  resolveGpuFlowVisualParityStableScreenshotRegion,
  summarizeGpuFlowActivationVisualParity,
  type GpuFlowVisualParitySnapshot,
} from "./gpuFlowVisualParityProbe";

describe("GPU flow visual parity probe helpers", () => {
  afterEach(() => {
    getInstalledProbeApi()?.uninstall();
    document.body.innerHTML = "";
  });

  it("captures real rects, device-pixel snapping, style, scroll, texture metadata, and upload state", () => {
    const node = createGpuNodeElement("node-a");
    const scroller = document.createElement("div");
    scroller.scrollLeft = 8;
    scroller.scrollTop = 24;
    node.append(scroller);
    node.style.backgroundColor = "rgb(10, 20, 30)";
    node.style.borderRadius = "6px";
    node.style.height = "60px";
    node.style.opacity = "0.9";
    node.style.overflow = "hidden";
    node.style.position = "absolute";
    node.style.transform = "translate(10.25px, 20.25px) scale(1)";
    node.style.transformOrigin = "0 0";
    node.style.width = "120px";
    setNodeRect(node, {
      height: 60,
      width: 120,
      x: 10.25,
      y: 20.25,
    });
    const performanceProbeKey = "testPerformanceProbe";
    (
      window as Window &
        Record<string, { snapshot(): Record<string, unknown> }>
    )[performanceProbeKey] = {
      snapshot: () => ({
        nodeLayerFrames: [
          { uploadedNodeIds: ["node-b"] },
          { uploadedNodeIds: ["node-a"] },
        ],
        queueCalls: [
          {
            height: 120,
            method: "copyElementImageToTexture",
            sourceInteractive: false,
            sourceNodeId: "node-a",
            timestampMs: 12,
            width: 240,
          },
          {
            height: 120,
            method: "copyElementImageToTexture",
            sourceInteractive: true,
            sourceNodeId: "node-a",
            timestampMs: 18,
            width: 240,
          },
        ],
      }),
    };

    const snapshot = captureGpuFlowVisualParitySnapshotForElement(node, {
      devicePixelRatio: 2,
      expectedRect: {
        height: 60,
        width: 120,
        x: 10.25,
        y: 20.25,
      },
      nodeId: "node-a",
      performanceProbeKey,
      phase: "passive-before",
      texture: {
        cssHeight: 60,
        cssWidth: 120,
        devicePixelRatio: 2,
        pixelHeight: 120,
        pixelWidth: 240,
        resolutionScale: 2,
        samplerMagFilter: "linear",
        samplerMinFilter: "linear",
        zoom: 1,
        zoomBucket: 1,
      },
      timestampMs: 20,
    });

    expect(snapshot.expectedRectDelta?.maxAbsCssPx).toBe(0);
    expect(snapshot.expectedSnappedRectDelta?.maxAbsCssPx).toBe(0);
    expect(snapshot.snappedRect).toMatchObject({
      left: 10.5,
      top: 20.5,
      width: 120,
    });
    expect(snapshot.style).toMatchObject({
      "background-color": "rgb(10, 20, 30)",
      opacity: "0.9",
      overflow: "hidden",
      position: "absolute",
      transform: "translate(10.25px, 20.25px) scale(1)",
      width: "120px",
    });
    expect(snapshot.scrollOffsets).toEqual([
      { path: [], scrollLeft: 0, scrollTop: 0 },
      { path: [0], scrollLeft: 8, scrollTop: 24 },
    ]);
    expect(snapshot.texture).toMatchObject({
      pixelHeight: 120,
      pixelWidth: 240,
      samplerMagFilter: "linear",
      zoomBucket: 1,
    });
    expect(snapshot.uploadState).toEqual({
      activeTextureUploadCountForNode: 1,
      lastNodeLayerFrameUploadedNode: true,
      lastTextureUpload: {
        height: 120,
        sourceInteractive: true,
        timestampMs: 18,
        width: 240,
      },
      nodeLayerFrameCount: 2,
      passiveTextureUploadCountForNode: 1,
      textureUploadCountForNode: 2,
    });
  });

  it("summarizes before/live/after geometry, style, and scroll drift", () => {
    const node = createGpuNodeElement("node-a");
    const scroller = document.createElement("div");
    scroller.scrollTop = 12;
    node.append(scroller);
    node.style.opacity = "1";
    node.style.transform = "translate(10px, 20px) scale(1)";
    node.style.width = "120px";
    setNodeRect(node, { height: 60, width: 120, x: 10, y: 20 });
    const passive = snapshot(node, "passive-before");
    const live = snapshot(node, "live-before-input");

    node.style.opacity = "0.92";
    scroller.scrollTop = 18;
    setNodeRect(node, { height: 60, width: 120, x: 10.75, y: 20 });
    const restored = snapshot(node, "restored-after-upload");

    const stableDelta = compareGpuFlowVisualParitySnapshots(passive, live);
    const summary = summarizeGpuFlowActivationVisualParity([
      passive,
      live,
      restored,
    ]);
    const restoredDelta = summary.deltas.find(
      (delta) => delta.candidatePhase === "restored-after-upload",
    );

    expect(stableDelta).toMatchObject({
      maxRectDeltaCssPx: 0,
      maxSnappedRectDeltaCssPx: 0,
      scrollOffsetMismatches: [],
      styleMismatches: [],
      withinTolerance: true,
    });
    expect(summary.reference).toBe(passive);
    expect(restoredDelta?.withinTolerance).toBe(false);
    expect(restoredDelta?.maxRectDeltaCssPx).toBe(0.75);
    expect(restoredDelta?.styleMismatches).toContainEqual({
      candidate: "0.92",
      property: "opacity",
      reference: "1",
    });
    expect(restoredDelta?.scrollOffsetMismatches).toEqual([
      {
        candidate: { path: [0], scrollLeft: 0, scrollTop: 18 },
        path: [0],
        reference: { path: [0], scrollLeft: 0, scrollTop: 12 },
      },
    ]);
  });

  it("prefers owner inline presentation for GPU host layout properties", () => {
    const node = createGpuNodeElement("node-a");
    node.style.height = "50px";
    node.style.pointerEvents = "all";
    node.style.position = "absolute";
    node.style.transform = "translate(12px, 18px) scale(1)";
    node.style.transformOrigin = "0 0";
    node.style.width = "100px";
    setNodeRect(node, { height: 50, width: 100, x: 12, y: 18 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (property: string) =>
        property === "position"
          ? "static"
          : property === "transform"
            ? "none"
            : node.style.getPropertyValue(property),
    } as CSSStyleDeclaration);

    const captured = snapshot(node, "passive-before");

    expect(captured.style.position).toBe("absolute");
    expect(captured.style.transform).toBe("translate(12px, 18px) scale(1)");
  });

  it("resolves a stable centered screenshot region inside a node rect", () => {
    const region = resolveGpuFlowVisualParityStableScreenshotRegion(
      {
        height: 128,
        width: 240,
        x: 32,
        y: 48,
      },
      {
        insetCssPx: {
          bottom: 12,
          left: 16,
          right: 20,
          top: 8,
        },
        maxHeightCssPx: 72,
        maxWidthCssPx: 120,
        minHeightCssPx: 60,
        minWidthCssPx: 100,
        regionId: "control-chrome",
      },
    );

    expect(region).toEqual({
      clip: {
        height: 72,
        width: 120,
        x: 90,
        y: 74,
      },
      regionId: "control-chrome",
    });
  });

  it("fails loudly when a screenshot region cannot meet its minimum size", () => {
    expect(() =>
      resolveGpuFlowVisualParityStableScreenshotRegion(
        {
          height: 40,
          width: 80,
          x: 0,
          y: 0,
        },
        {
          insetCssPx: 16,
          minHeightCssPx: 16,
          minWidthCssPx: 64,
        },
      ),
    ).toThrow(
      "GPU flow visual parity screenshot width 48 is below minimum 64.",
    );
  });

  it("compares stable RGBA pixel regions with meaningful diff metrics", () => {
    const reference = {
      data: new Uint8ClampedArray([
        10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
      ]),
      height: 2,
      width: 2,
    };
    const candidate = {
      data: new Uint8ClampedArray([
        10, 20, 30, 255, 44, 55, 66, 255, 70, 80, 90, 255, 100, 110, 123, 255,
      ]),
      height: 2,
      width: 2,
    };

    expect(
      compareGpuFlowVisualParityPixelRegions(reference, candidate, {
        changedPixelChannelThreshold: 3,
        maxChangedPixelRatio: 0.25,
        maxChannelDelta: 6,
      }),
    ).toEqual({
      changedPixelCount: 1,
      changedPixelRatio: 0.25,
      height: 2,
      maxChannelDelta: 6,
      meanAbsoluteChannelDelta: 1.125,
      pixelCount: 4,
      width: 2,
      withinTolerance: true,
    });
  });

  it("injects a self-contained browser probe that captures a GPU node by id", () => {
    const node = createGpuNodeElement("node-a");
    node.style.height = "40px";
    node.style.transform = "translate(4px, 8px) scale(2)";
    node.style.width = "80px";
    setNodeRect(node, { height: 80, width: 160, x: 4, y: 8 });

    window.eval(createGpuFlowVisualParityProbeInitScript());
    const captured = getInstalledProbeApi()?.capture({
      devicePixelRatio: 2,
      expectedRect: { height: 80, width: 160, x: 4, y: 8 },
      nodeId: "node-a",
      phase: "live-before-input",
      timestampMs: 30,
    });

    expect(captured).toMatchObject({
      expectedRectDelta: { maxAbsCssPx: 0 },
      nodeId: "node-a",
      phase: "live-before-input",
      rect: {
        height: 80,
        width: 160,
        x: 4,
        y: 8,
      },
      style: {
        height: "40px",
        transform: "translate(4px, 8px) scale(2)",
        width: "80px",
      },
      timestampMs: 30,
    });
  });
});

function createGpuNodeElement(nodeId: string): HTMLElement {
  const node = document.createElement("div");
  node.dataset.gpuFlowNode = "true";
  node.dataset.id = nodeId;
  document.body.append(node);
  return node;
}

function snapshot(
  node: HTMLElement,
  phase: GpuFlowVisualParitySnapshot["phase"],
): GpuFlowVisualParitySnapshot {
  return captureGpuFlowVisualParitySnapshotForElement(node, {
    devicePixelRatio: 2,
    nodeId: "node-a",
    phase,
    timestampMs: 1,
  });
}

function setNodeRect(
  element: HTMLElement,
  rect: { readonly height: number; readonly width: number; readonly x: number; readonly y: number },
) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: rect.y + rect.height,
      height: rect.height,
      left: rect.x,
      right: rect.x + rect.width,
      toJSON: () => ({}),
      top: rect.y,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }),
  });
}

function getInstalledProbeApi():
  | {
      capture(input: {
        readonly devicePixelRatio?: number | undefined;
        readonly expectedRect?:
          | {
              readonly height: number;
              readonly width: number;
              readonly x: number;
              readonly y: number;
            }
          | undefined;
        readonly nodeId: string;
        readonly phase: GpuFlowVisualParitySnapshot["phase"];
        readonly timestampMs?: number | undefined;
      }): GpuFlowVisualParitySnapshot;
      uninstall(): void;
    }
  | undefined {
  return (
    window as Window &
      Record<
        string,
        {
          capture(input: {
            readonly devicePixelRatio?: number | undefined;
            readonly expectedRect?:
              | {
                  readonly height: number;
                  readonly width: number;
                  readonly x: number;
                  readonly y: number;
                }
              | undefined;
            readonly nodeId: string;
            readonly phase: GpuFlowVisualParitySnapshot["phase"];
            readonly timestampMs?: number | undefined;
          }): GpuFlowVisualParitySnapshot;
          uninstall(): void;
        }
      >
  )[GPU_FLOW_VISUAL_PARITY_PROBE_KEY];
}
