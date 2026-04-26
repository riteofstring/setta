/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { GpuNodeLayout } from "./GpuNodeLayer";
import { resolveGpuActiveNodeSnapshot } from "./GpuActiveNodeSnapshot";

describe("GpuActiveNodeSnapshot", () => {
  it("resolves an active node to screen-space presentation", () => {
    const element = document.createElement("div");
    const snapshot = resolveGpuActiveNodeSnapshot({
      activeNodeId: "active",
      elementByNodeId: new Map([["active", element]]),
      frame: 9,
      nodes: [
        node("hidden", 0, 0, 120, 60, 1),
        node("active", 10, 20, 100, 50, 7),
      ],
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

  it("ignores missing and zero-sized active nodes", () => {
    expect(
      resolveGpuActiveNodeSnapshot({
        activeNodeId: "active",
        elementByNodeId: new Map([["active", document.createElement("div")]]),
        frame: 1,
        nodes: [node("active", 10, 20, null, 50, 0)],
        viewport: [0, 0, 1],
      }),
    ).toBeNull();
    expect(
      resolveGpuActiveNodeSnapshot({
        activeNodeId: "missing",
        elementByNodeId: new Map([["active", document.createElement("div")]]),
        frame: 1,
        nodes: [node("active", 10, 20, 100, 50, 0)],
        viewport: [0, 0, 1],
      }),
    ).toBeNull();
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
