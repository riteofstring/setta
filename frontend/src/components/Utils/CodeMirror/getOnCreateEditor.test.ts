// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { GPU_FLOW_NODE_DIRTY_EVENT } from "gpuFlow/nodeDirtyEvents";
import { requestGpuFlowCodeMirrorActivationPaint } from "./getOnCreateEditor";

describe("CodeMirror GPU flow activation paint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests an interactive dirty event and canvas paint after the next frame", () => {
    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        queuedFrames.push(callback);
        return 1;
      }),
    );

    const canvas = document.createElement("canvas") as HTMLCanvasElement & {
      requestPaint: () => void;
    };
    canvas.setAttribute("layoutsubtree", "");
    canvas.requestPaint = vi.fn();
    const editor = document.createElement("div");
    canvas.append(editor);

    const dirtyDetails: unknown[] = [];
    canvas.addEventListener(GPU_FLOW_NODE_DIRTY_EVENT, (event) => {
      dirtyDetails.push((event as CustomEvent).detail);
    });

    requestGpuFlowCodeMirrorActivationPaint({ dom: editor });

    expect(canvas.requestPaint).not.toHaveBeenCalled();
    const frame = queuedFrames[0];
    expect(frame).toBeDefined();
    if (!frame) {
      throw new Error(
        "Expected CodeMirror activation paint to schedule a frame.",
      );
    }
    frame(0);

    expect(dirtyDetails).toEqual([
      { priority: "interactive", reason: "focus" },
    ]);
    expect(canvas.requestPaint).toHaveBeenCalledTimes(1);
  });
});
