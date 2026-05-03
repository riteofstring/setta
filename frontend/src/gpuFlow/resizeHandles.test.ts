/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import {
  getGpuNodeResizeHandleRects,
  resolveGpuNodeResizeTargetAtClientPoint,
  resolveGpuNodeResizeTargetAtFlowPoint,
} from "./resizeHandles";
import type { GpuSectionSceneNode } from "./scene";

describe("GPU node resize geometry", () => {
  it("builds scene-owned hit rects from measured node geometry", () => {
    expect(
      getGpuNodeResizeHandleRects(
        sectionNode({
          height: 80,
          nodeId: "section-a",
          width: 120,
          x: 10,
          y: 20,
        }),
      ),
    ).toEqual([
      {
        direction: "right",
        nodeId: "section-a",
        rect: { height: 80, width: 16, x: 122, y: 20 },
      },
      {
        direction: "bottom",
        nodeId: "section-a",
        rect: { height: 16, width: 120, x: 10, y: 92 },
      },
      {
        direction: "bottomRight",
        nodeId: "section-a",
        rect: { height: 16, width: 16, x: 122, y: 92 },
      },
    ]);
  });

  it("hit-tests the outside resize band without DOM handles", () => {
    const nodes = [
      sectionNode({
        height: 80,
        nodeId: "section-a",
        width: 120,
        x: 10,
        y: 20,
      }),
    ];

    expect(
      resolveGpuNodeResizeTargetAtFlowPoint({
        nodes,
        point: { x: 126, y: 98 },
      }),
    ).toEqual({ direction: "bottomRight", nodeId: "section-a" });
    expect(
      resolveGpuNodeResizeTargetAtFlowPoint({
        nodes,
        point: { x: 126, y: 44 },
      }),
    ).toEqual({ direction: "right", nodeId: "section-a" });
    expect(
      resolveGpuNodeResizeTargetAtFlowPoint({
        nodes,
        point: { x: 36, y: 98 },
      }),
    ).toEqual({ direction: "bottom", nodeId: "section-a" });
  });

  it("uses z order and scene resize policy for hits", () => {
    const nodes = [
      sectionNode({
        height: 80,
        nodeId: "back",
        width: 120,
        x: 10,
        y: 20,
        zIndex: 1,
      }),
      sectionNode({
        directions: ["right"],
        height: 80,
        nodeId: "front",
        width: 120,
        x: 10,
        y: 20,
        zIndex: 2,
      }),
    ];

    expect(
      resolveGpuNodeResizeTargetAtFlowPoint({
        nodes,
        point: { x: 126, y: 98 },
      }),
    ).toEqual({ direction: "right", nodeId: "front" });
  });

  it("normalizes client points through the viewport before hit testing", () => {
    const surface = document.createElement("div");
    surface.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 220,
          height: 200,
          left: 30,
          right: 430,
          top: 20,
          width: 400,
          x: 30,
          y: 20,
        }) as DOMRect,
    );

    expect(
      resolveGpuNodeResizeTargetAtClientPoint({
        clientX: 284,
        clientY: 216,
        nodes: [
          sectionNode({
            height: 80,
            nodeId: "section-a",
            width: 120,
            x: 10,
            y: 20,
          }),
        ],
        surfaceElement: surface,
        viewport: [6, 8, 2],
      }),
    ).toEqual({ direction: "bottomRight", nodeId: "section-a" });
  });
});

function sectionNode({
  directions = ["right", "bottom", "bottomRight"],
  height,
  nodeId,
  width,
  x,
  y,
  zIndex,
}: {
  readonly directions?: GpuSectionSceneNode["resizePolicy"]["directions"];
  readonly height: number;
  readonly nodeId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex?: number | undefined;
}): GpuSectionSceneNode {
  const rect = { height, width, x, y };
  return {
    bodyRect: rect,
    childLayout: { gap: { x: 0, y: 0 } },
    childSectionIds: [],
    childViewportRect: null,
    chromeRect: rect,
    clipRect: rect,
    contentRenderer: { kind: "dom-section", surfaceId: nodeId },
    dirty: [],
    height,
    interactionLayer: "content",
    layoutMode: "none",
    localRect: rect,
    nodeId,
    parentSectionId: null,
    portAnchors: [],
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions,
      locked: false,
      maxHeight: 1000,
      maxWidth: 1000,
      minHeight: 0,
      minWidth: 0,
    },
    scrollOffset: { x: 0, y: 0 },
    sectionId: nodeId,
    width,
    worldRect: rect,
    x,
    y,
    ...(zIndex !== undefined ? { zIndex } : {}),
  };
}
