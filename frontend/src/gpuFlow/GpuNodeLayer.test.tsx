/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  buildTexturedGpuNodeQuads,
  collectVisibleGpuNodeQuads,
  syncGpuNodeDomTransforms,
  type GpuNodeLayout,
} from "./GpuNodeLayer";
import type { NodeTextureRecord } from "./nodeTextures";

describe("GpuNodeLayer helpers", () => {
  it("culls nodes in flow space and preserves z-order draw order", () => {
    const nodes: GpuNodeLayout[] = [
      node("behind", 40, 40, 100, 100, 3),
      node("culled", 1_000, 1_000, 100, 100, 1),
      node("front", 20, 20, 100, 100, 9),
      node("unknown-size", 10, 10, null, 100, 0),
      node("forced", 2_000, 2_000, 100, 100, 2),
    ];

    const quads = collectVisibleGpuNodeQuads({
      canvasHeight: 300,
      canvasWidth: 400,
      forceVisibleNodeIds: ["forced"],
      marginCssPx: 0,
      nodes,
      viewport: [0, 0, 1],
    });

    expect(quads.map((quad) => quad.nodeId)).toEqual([
      "forced",
      "behind",
      "front",
    ]);
  });

  it("pairs visible quads with existing node textures and reports misses", () => {
    const texture = textureRecord("node-a");
    const result = buildTexturedGpuNodeQuads(
      [
        { height: 20, nodeId: "node-a", width: 30, x: 1, y: 2, zIndex: 0 },
        { height: 20, nodeId: "node-b", width: 30, x: 1, y: 2, zIndex: 0 },
      ],
      (nodeId) => (nodeId === "node-a" ? texture : undefined),
    );

    expect(result.texturedQuads).toEqual([
      {
        height: 20,
        nodeId: "node-a",
        texture,
        width: 30,
        x: 1,
        y: 2,
        zIndex: 0,
      },
    ]);
    expect(result.missingTextureNodeIds).toEqual(["node-b"]);
  });

  it("synchronizes visible DOM hit targets and parks culled nodes offscreen", () => {
    const visible = document.createElement("div");
    const culled = document.createElement("div");
    const elements = new Map([
      ["visible", visible],
      ["culled", culled],
    ]);

    syncGpuNodeDomTransforms({
      elementByNodeId: elements,
      nodes: [
        node("visible", 10, 20, 100, 50, 0),
        node("culled", 30, 40, 100, 50, 0),
      ],
      visibleNodeIds: new Set(["visible"]),
      viewport: { x: 5, y: -10, zoom: 1.5 },
    });

    expect(visible.style.position).toBe("absolute");
    expect(visible.style.transformOrigin).toBe("0 0");
    expect(visible.style.transform).toBe("translate(20px, 20px) scale(1.5)");
    expect(visible.style.pointerEvents).toBe("all");
    expect(culled.style.transform).toBe(
      "translate(-100000px, -100000px) scale(1)",
    );
    expect(culled.style.pointerEvents).toBe("none");
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

function textureRecord(nodeId: string): NodeTextureRecord {
  return {
    nodeId,
    sampler: {},
    texture: {},
    textureView: {},
  } as NodeTextureRecord;
}
