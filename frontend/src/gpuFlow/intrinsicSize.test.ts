/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import { createGpuFlowIntrinsicSizeController } from "./intrinsicSize";
import { createGpuFlowLayoutStore } from "./layoutStore";

describe("GpuFlow intrinsic size controller", () => {
  it("coalesces dirty source nodes and applies accepted sizes to the layout store", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [
        {
          height: null,
          nodeId: "node-a",
          width: 100,
          x: 10,
          y: 20,
          zIndex: 1,
        },
      ],
    });
    const frames = createFrameQueue();
    const resizeObserver = createResizeObserverMock();
    const mutationObserver = createMutationObserverMock();
    const onIntrinsicSizesApplied = vi.fn();
    const element = document.createElement("div");
    const resolveIntrinsicSize = vi.fn(() => ({ height: 80, width: 120 }));

    const controller = createGpuFlowIntrinsicSizeController({
      ResizeObserver: resizeObserver.ResizeObserver,
      layoutStore: store,
      MutationObserver: mutationObserver.MutationObserver,
      onIntrinsicSizesApplied,
      requestAnimationFrame: frames.requestAnimationFrame,
      resolveIntrinsicSize,
    });

    controller.setNodeElement("node-a", element);
    resizeObserver.dispatch([{ target: element } as ResizeObserverEntry]);
    mutationObserver.dispatch();
    controller.markNodesDirty(["node-a"]);

    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(store.getState().getNode("node-a")).toMatchObject({
      height: null,
      width: 100,
    });

    frames.flush();

    expect(resolveIntrinsicSize).toHaveBeenCalledTimes(1);
    expect(resolveIntrinsicSize).toHaveBeenCalledWith({
      element,
      layoutNode: expect.objectContaining({ nodeId: "node-a" }),
      nodeId: "node-a",
    });
    expect(store.getState().getNode("node-a")).toMatchObject({
      height: 80,
      width: 120,
    });
    expect(store.getState().lastChange).toMatchObject({
      changedNodeIds: ["node-a"],
      dirty: [
        "node-geometry",
        "edge-geometry",
        "selection-bounds",
        "visible-set",
        "texture-size",
      ],
      phase: "commit",
      reason: "intrinsic-size",
    });
    expect(onIntrinsicSizesApplied).toHaveBeenCalledWith({
      change: expect.objectContaining({
        changedNodeIds: ["node-a"],
        reason: "intrinsic-size",
      }),
      updates: [{ height: 80, nodeId: "node-a", width: 120 }],
    });
  });

  it("disconnects observed elements and cancels pending intrinsic work", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [
        {
          height: null,
          nodeId: "node-a",
          width: 100,
          x: 0,
          y: 0,
        },
      ],
    });
    const frames = createFrameQueue();
    const resizeObserver = createResizeObserverMock();
    const mutationObserver = createMutationObserverMock();
    const element = document.createElement("div");
    const resolveIntrinsicSize = vi.fn(() => ({ height: 80 }));

    const controller = createGpuFlowIntrinsicSizeController({
      ResizeObserver: resizeObserver.ResizeObserver,
      cancelAnimationFrame: frames.cancelAnimationFrame,
      layoutStore: store,
      MutationObserver: mutationObserver.MutationObserver,
      requestAnimationFrame: frames.requestAnimationFrame,
      resolveIntrinsicSize,
    });

    controller.setNodeElement("node-a", element);
    controller.disconnect();
    frames.flush();

    expect(frames.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(resizeObserver.unobserve).toHaveBeenCalledWith(element);
    expect(resizeObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(mutationObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(resolveIntrinsicSize).not.toHaveBeenCalled();
    expect(store.getState().getNode("node-a")).toMatchObject({
      height: null,
    });
  });
});

function createFrameQueue() {
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    cancelAnimationFrame: vi.fn((frameId: number) => {
      callbacks.delete(frameId);
    }),
    flush() {
      const pending = Array.from(callbacks.values());
      callbacks.clear();
      for (const callback of pending) {
        callback(0);
      }
    },
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    }),
  };
}

function createResizeObserverMock() {
  let callback: ResizeObserverCallback | null = null;
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();
  class ResizeObserverMock {
    constructor(nextCallback: ResizeObserverCallback) {
      callback = nextCallback;
    }

    observe = observe;
    unobserve = unobserve;
    disconnect = disconnect;
  }
  return {
    ResizeObserver: ResizeObserverMock as unknown as typeof ResizeObserver,
    disconnect,
    dispatch(entries: readonly ResizeObserverEntry[]) {
      callback?.(entries as ResizeObserverEntry[], {} as ResizeObserver);
    },
    observe,
    unobserve,
  };
}

function createMutationObserverMock() {
  let callback: MutationCallback | null = null;
  const observe = vi.fn();
  const disconnect = vi.fn();
  class MutationObserverMock {
    constructor(nextCallback: MutationCallback) {
      callback = nextCallback;
    }

    observe = observe;
    disconnect = disconnect;
    takeRecords = () => [];
  }
  return {
    MutationObserver:
      MutationObserverMock as unknown as typeof MutationObserver,
    disconnect,
    dispatch() {
      callback?.([], {} as MutationObserver);
    },
    observe,
  };
}
