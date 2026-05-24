/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import type { GpuSurfaceProps } from "../GpuSurface";
import { createGpuPaintNodeElement } from "../htmlSurfaces/frame.test-helper";
import { handleGpuFlowSurfacePaint } from "./flowSurfacePaintHandler";
import type { GpuFlowCallbacks } from "./flowSurfaceTypes";

type GpuFlowSurfacePaintHandler = NonNullable<GpuSurfaceProps["onPaint"]>;
type GpuFlowSurfacePaintRuntime = Parameters<GpuFlowSurfacePaintHandler>[0];
type GpuFlowSurfacePaintEvent = Parameters<GpuFlowSurfacePaintHandler>[1];

describe("handleGpuFlowSurfacePaint", () => {
  it("requests a texture upload frame when paint dirties a surface", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const input = document.createElement("input");
    nodeElement.append(input);
    const requestFrame = vi.fn();
    const onPaint = vi.fn();
    const followUpCallbacks: Array<() => void> = [];
    const textureManager = {
      getDirtySurfaces: vi.fn(() => []),
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };
    const transformOnlyPaintNodeIds = new Set(["node-b"]);

    handleGpuFlowSurfacePaint({
      callbacks: callbacks({ onPaint }),
      event: { changedElements: [input] } as GpuFlowSurfacePaintEvent,
      getFrame: () => 7,
      nodeElementById: new Map([["node-a", nodeElement]]),
      runtime: {} as GpuFlowSurfacePaintRuntime,
      scheduleFollowUpFrame: (callback) => followUpCallbacks.push(callback),
      surface: { requestFrame },
      textureManager,
      transformOnlyPaintNodeIds,
    });

    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 7,
      reason: "paint",
      requestPaint: false,
      surfaceId: "node-a",
    });
    expect(requestFrame).toHaveBeenCalledWith("manual");
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
    expect(followUpCallbacks).toHaveLength(1);
    followUpCallbacks[0]?.();
    expect(requestFrame.mock.calls).toEqual([
      ["manual"],
      ["texture-upload"],
      ["manual"],
      ["texture-upload"],
    ]);
    expect(onPaint).toHaveBeenCalledOnce();
    expect(transformOnlyPaintNodeIds.size).toBe(0);
  });

  it("does not request a texture upload frame when paint only settles deferrals", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const requestFrame = vi.fn();
    const textureManager = {
      getDirtySurfaces: vi.fn(() => []),
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    handleGpuFlowSurfacePaint({
      callbacks: callbacks(),
      event: { changedElements: [] } as unknown as GpuFlowSurfacePaintEvent,
      getFrame: () => 8,
      nodeElementById: new Map([["node-a", nodeElement]]),
      runtime: {} as GpuFlowSurfacePaintRuntime,
      surface: { requestFrame },
      textureManager,
      transformOnlyPaintNodeIds: new Set(),
    });

    expect(textureManager.markSurfacesPainted).toHaveBeenCalledWith(
      expect.any(Object),
    );
    expect(textureManager.markSurfaceTextureDirty).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("requests a texture upload frame when paint may unblock queued dirty surfaces", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const requestFrame = vi.fn();
    const followUpCallbacks: Array<() => void> = [];
    const textureManager = {
      getDirtySurfaces: vi.fn(() => [
        {
          dirtyContent: true,
          dirtyResolution: false,
          dirtyTileBytes: 4,
          dirtyTileIds: ["node-a:0:0"],
          lastDirtyFrame: 1,
          priority: "interactive",
          reasons: ["content"],
          sequence: 1,
          surfaceId: "node-a",
          workKinds: ["content"],
        },
      ]),
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    handleGpuFlowSurfacePaint({
      callbacks: callbacks(),
      event: { changedElements: [] } as unknown as GpuFlowSurfacePaintEvent,
      getFrame: () => 9,
      nodeElementById: new Map([["node-a", nodeElement]]),
      runtime: {} as GpuFlowSurfacePaintRuntime,
      scheduleFollowUpFrame: (callback) => followUpCallbacks.push(callback),
      surface: { requestFrame },
      textureManager,
      transformOnlyPaintNodeIds: new Set(),
    });

    expect(textureManager.markSurfaceTextureDirty).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledWith("manual");
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
    expect(followUpCallbacks).toHaveLength(1);
  });
});

function callbacks(
  overrides: Partial<GpuFlowCallbacks> = {},
): GpuFlowCallbacks {
  return {
    framePerformanceReporter: undefined,
    ...overrides,
  };
}
