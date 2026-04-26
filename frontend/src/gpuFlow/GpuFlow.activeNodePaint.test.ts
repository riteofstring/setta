/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  resolveGpuActiveNodeFrameSync,
  resolveGpuActiveNodePaintedIds,
} from "./GpuFlow";

describe("GpuFlow active node paint settling", () => {
  it("keeps a restored active node suppressed and deferred until its paint arrives", () => {
    expect(
      resolveGpuActiveNodeFrameSync({
        pendingPaintNodeIds: new Set(["node-a"]),
        settlingNodeIds: new Set(["node-a"]),
        teleportedNodeId: null,
      }),
    ).toEqual({
      deferUploadNodeIds: ["node-a"],
      suppressNodeIds: ["node-a"],
    });
  });

  it("clears pending paint only for active nodes covered by the paint event", () => {
    const canvas = document.createElement("canvas");
    const nodeA = document.createElement("div");
    const nodeAChild = document.createElement("button");
    const nodeB = document.createElement("div");
    const nodeBChild = document.createElement("input");
    const unrelated = document.createElement("div");
    nodeA.append(nodeAChild);
    nodeB.append(nodeBChild);
    canvas.append(nodeA, nodeB);

    expect(
      resolveGpuActiveNodePaintedIds({
        changedElements: [nodeAChild, unrelated],
        elementByNodeId: new Map([
          ["node-a", nodeA],
          ["node-b", nodeB],
        ]),
        pendingPaintNodeIds: new Set(["node-a", "node-b"]),
      }),
    ).toEqual(["node-a"]);

    expect(
      resolveGpuActiveNodePaintedIds({
        changedElements: [canvas],
        elementByNodeId: new Map([
          ["node-a", nodeA],
          ["node-b", nodeB],
        ]),
        pendingPaintNodeIds: new Set(["node-a", "node-b"]),
      }),
    ).toEqual(["node-a", "node-b"]);
  });

  it("treats unspecified changed elements as a full active-node paint", () => {
    expect(
      resolveGpuActiveNodePaintedIds({
        elementByNodeId: new Map(),
        pendingPaintNodeIds: new Set(["node-a", "node-b"]),
      }),
    ).toEqual(["node-a", "node-b"]);
  });
});
