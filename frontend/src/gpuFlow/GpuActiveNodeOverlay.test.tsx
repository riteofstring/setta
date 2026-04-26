/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";
import {
  areGpuActiveNodeOverlaySnapshotsEqual,
  GpuActiveNodeOverlay,
  resolveGpuActiveNodeOverlaySnapshot,
  type GpuActiveNodeOverlaySnapshot,
} from "./GpuActiveNodeOverlay";
import type { GpuNodeLayout } from "./GpuNodeLayer";

describe("GpuActiveNodeOverlay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves a single overlay-active node to screen-space presentation", () => {
    const element = document.createElement("div");
    const snapshot = resolveGpuActiveNodeOverlaySnapshot({
      elementByNodeId: new Map([["active", element]]),
      frame: 9,
      nodes: [
        node("hidden", 0, 0, 120, 60, 1),
        node("active", 10, 20, 100, 50, 7),
      ],
      overlayNodeId: "active",
      viewport: { x: 5, y: -10, zoom: 1.5 },
    });

    expect(snapshot).toEqual({
      frame: 9,
      height: 50,
      nodeId: "active",
      screenX: 20,
      screenY: 20,
      sourceElement: element,
      width: 100,
      zIndex: 7,
      zoom: 1.5,
    });
  });

  it("ignores missing and zero-sized overlay nodes", () => {
    expect(
      resolveGpuActiveNodeOverlaySnapshot({
        elementByNodeId: new Map([["active", document.createElement("div")]]),
        frame: 1,
        nodes: [node("active", 10, 20, null, 50, 0)],
        overlayNodeId: "active",
        viewport: [0, 0, 1],
      }),
    ).toBeNull();
    expect(
      resolveGpuActiveNodeOverlaySnapshot({
        elementByNodeId: new Map([["active", document.createElement("div")]]),
        frame: 1,
        nodes: [node("active", 10, 20, 100, 50, 0)],
        overlayNodeId: "missing",
        viewport: [0, 0, 1],
      }),
    ).toBeNull();
  });

  it("renders an inert visual clone outside the canvas hit-test child path", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const source = document.createElement("div");
    source.id = "source-node";
    source.dataset.id = "active";
    source.style.transform = "translate(20px, 30px) scale(2)";
    const input = document.createElement("input");
    input.id = "source-input";
    input.value = "live value";
    source.append(input);
    const snapshot: GpuActiveNodeOverlaySnapshot = {
      frame: 1,
      height: 50,
      nodeId: "active",
      screenX: 20,
      screenY: 30,
      sourceElement: source,
      width: 100,
      zIndex: 3,
      zoom: 2,
    };

    act(() => {
      root.render(<GpuActiveNodeOverlay snapshot={snapshot} />);
    });

    const overlay = host.querySelector<HTMLElement>(
      "[data-gpu-flow-active-node-overlay='true']",
    );
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("aria-hidden")).toBeNull();
    expect(overlay?.getAttribute("inert")).toBe("");
    expect(overlay?.dataset.id).toBe("active");
    expect(overlay?.style.transform).toBe("translate(20px, 30px) scale(2)");
    expect(overlay?.style.width).toBe("100px");
    expect(overlay?.style.height).toBe("50px");
    expect(
      host.querySelector("[data-gpu-flow-active-node-overlay-layer='true']"),
    ).not.toBeNull();
    const clone = overlay?.querySelector<HTMLElement>(
      "[data-gpu-flow-active-node-overlay-clone='true']",
    );
    expect(clone).not.toBeNull();
    expect(clone?.id).toBe("");
    expect(clone?.style.transform).toBe("none");
    expect(clone?.querySelector("input")?.id).toBe("");
    expect(clone?.querySelector("input")?.value).toBe("live value");

    act(() => {
      root.unmount();
    });
  });

  it("keeps active overlay form values and switch state synced", () => {
    const animationFrames = installAnimationFrameQueue();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const source = document.createElement("div");
    source.dataset.id = "active";
    const input = document.createElement("input");
    input.value = "initial";
    const switchRoot = document.createElement("button");
    switchRoot.setAttribute("role", "switch");
    switchRoot.setAttribute("aria-checked", "false");
    switchRoot.setAttribute("data-state", "unchecked");
    const switchThumb = document.createElement("span");
    switchThumb.setAttribute("data-state", "unchecked");
    switchRoot.append(switchThumb);
    source.append(input, switchRoot);
    const snapshot: GpuActiveNodeOverlaySnapshot = {
      frame: 1,
      height: 50,
      nodeId: "active",
      screenX: 20,
      screenY: 30,
      sourceElement: source,
      width: 100,
      zIndex: 3,
      zoom: 2,
    };

    act(() => {
      root.render(<GpuActiveNodeOverlay snapshot={snapshot} />);
    });

    input.value = "typed";
    switchRoot.setAttribute("aria-checked", "true");
    switchRoot.setAttribute("data-state", "checked");
    switchThumb.setAttribute("data-state", "checked");

    act(() => {
      animationFrames.flushNext();
    });

    const clone = host.querySelector<HTMLElement>(
      "[data-gpu-flow-active-node-overlay-clone='true']",
    );
    expect(clone?.querySelector("input")?.value).toBe("typed");
    expect(
      clone?.querySelector("[role='switch']")?.getAttribute("data-state"),
    ).toBe("checked");
    expect(
      clone?.querySelector("[role='switch']")?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(clone?.querySelector("span")?.getAttribute("data-state")).toBe(
      "checked",
    );

    act(() => {
      root.unmount();
    });
    animationFrames.restore();
  });

  it("keeps unchanged overlay snapshots stable", () => {
    const sourceElement = document.createElement("div");
    const snapshot: GpuActiveNodeOverlaySnapshot = {
      frame: 1,
      height: 10,
      nodeId: "node-a",
      screenX: 1,
      screenY: 2,
      sourceElement,
      width: 20,
      zIndex: 0,
      zoom: 1,
    };

    expect(
      areGpuActiveNodeOverlaySnapshotsEqual(snapshot, { ...snapshot }),
    ).toBe(true);
    expect(
      areGpuActiveNodeOverlaySnapshotsEqual(snapshot, {
        ...snapshot,
        frame: 2,
      }),
    ).toBe(true);
    expect(
      areGpuActiveNodeOverlaySnapshotsEqual(snapshot, {
        ...snapshot,
        screenX: 3,
      }),
    ).toBe(false);
  });
});

function installAnimationFrameQueue() {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const handle = nextHandle;
    nextHandle += 1;
    callbacks.set(handle, callback);
    return handle;
  };
  window.cancelAnimationFrame = (handle: number) => {
    callbacks.delete(handle);
  };
  return {
    flushNext() {
      const [handle, callback] = callbacks.entries().next().value ?? [];
      if (handle === undefined || !callback) {
        throw new Error("Expected a pending animation frame callback.");
      }
      callbacks.delete(handle);
      callback(performance.now());
    },
    restore() {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    },
  };
}

function node(
  nodeId: string,
  x: number,
  y: number,
  width: number | null,
  height: number | null,
  zIndex: number,
): GpuNodeLayout {
  return {
    height,
    nodeId,
    width,
    x,
    y,
    zIndex,
  };
}
