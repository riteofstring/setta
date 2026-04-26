import { describe, expect, it, vi } from "vitest";
import { createCanvasFlowLiveTextureRefreshController } from "./canvasFlowLiveTextureRefresh";

describe("createCanvasFlowLiveTextureRefreshController", () => {
  it("refreshes requested nodes every animation frame until their deadline", () => {
    let now = 0;
    let nextFrameId = 1;
    const frames = new Map<number, FrameRequestCallback>();
    const scheduleTexturePaint = vi.fn();
    const controller = createCanvasFlowLiveTextureRefreshController({
      cancelAnimationFrame: (id) => {
        frames.delete(id);
      },
      now: () => now,
      requestAnimationFrame: (callback) => {
        const id = nextFrameId;
        nextFrameId += 1;
        frames.set(id, callback);
        return id;
      },
      scheduleTexturePaint,
    });

    controller.request("node-input", new Set(["a"]), 40);
    expect(frames.size).toBe(1);

    runNextFrame(frames, 16);
    expect(scheduleTexturePaint).toHaveBeenLastCalledWith(
      "live-node-input",
      new Set(["a"]),
    );

    controller.request("node-change", new Set(["b"]), 40);
    runNextFrame(frames, 32);
    expect(scheduleTexturePaint).toHaveBeenLastCalledWith(
      "live-node-change",
      new Set(["a", "b"]),
    );

    now = 80;
    runNextFrame(frames, 80);
    expect(scheduleTexturePaint).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
  });

  it("cancels a pending frame on destroy", () => {
    const frames = new Map<number, FrameRequestCallback>();
    const controller = createCanvasFlowLiveTextureRefreshController({
      cancelAnimationFrame: (id) => {
        frames.delete(id);
      },
      now: () => 0,
      requestAnimationFrame: (callback) => {
        frames.set(1, callback);
        return 1;
      },
      scheduleTexturePaint: vi.fn(),
    });

    controller.request("node-input", new Set(["a"]));
    expect(frames.size).toBe(1);
    controller.destroy();
    expect(frames.size).toBe(0);
  });
});

function runNextFrame(
  frames: Map<number, FrameRequestCallback>,
  timestamp: number,
) {
  const [id, callback] = frames.entries().next().value as [
    number,
    FrameRequestCallback,
  ];
  frames.delete(id);
  callback(timestamp);
}
