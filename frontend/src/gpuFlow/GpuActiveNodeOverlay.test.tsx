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
    ).toBe(false);
  });
});

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
