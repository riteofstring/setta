/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import type { GpuNodeLayout } from "../htmlSurfaces/frame";
import type { GpuSectionSceneNode } from "../scene";
import {
  resolveGpuFlowNodeResizeCursor,
  resolveGpuFlowNodeResizeTarget,
} from "./nodeResizeTarget";

describe("GpuFlow node resize target resolution", () => {
  it("resolves resize starts from renderer-owned geometry without DOM handles", () => {
    const surface = document.createElement("div");
    surface.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 200,
          height: 200,
          left: 0,
          right: 400,
          top: 0,
          width: 400,
          x: 0,
          y: 0,
        }) as DOMRect,
    );

    expect(
      resolveGpuFlowNodeResizeTarget({
        effectProjectors: new Map(),
        elementByNodeId: new Map(),
        event: new MouseEvent("pointerdown", {
          clientX: 136,
          clientY: 106,
        }) as PointerEvent,
        nodes: [sectionNode("section-a")],
        sourceInteractionProjector: noopProjector(),
        surfaceElement: surface,
        viewport: [0, 0, 1],
      }),
    ).toEqual({ direction: "bottomRight", nodeId: "section-a" });
  });

  it("uses scene resize geometry for hover cursors", () => {
    const surface = document.createElement("div");
    surface.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 200,
          height: 200,
          left: 0,
          right: 400,
          top: 0,
          width: 400,
          x: 0,
          y: 0,
        }) as DOMRect,
    );

    expect(
      resolveGpuFlowNodeResizeCursor({
        event: new MouseEvent("pointermove", {
          clientX: 136,
          clientY: 60,
        }) as PointerEvent,
        nodes: [sectionNode("section-a")],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      }),
    ).toBe("col-resize");
  });
});

function noopProjector() {
  return {
    alignSourceToClientPoint: vi.fn(),
    clearSource: vi.fn(),
    destroy: vi.fn(),
    getProjectedSourceId: vi.fn(() => null),
  };
}

function sectionNode(sectionId: string): GpuNodeLayout {
  const rect = {
    height: 80,
    width: 120,
    x: 10,
    y: 20,
  };
  return {
    ...rect,
    bodyRect: rect,
    childLayout: { gap: { x: 0, y: 0 } },
    childSectionIds: [],
    childViewportRect: null,
    chromeRect: rect,
    clipRect: rect,
    contentRenderer: {
      kind: "dom-section",
      surfaceId: sectionId,
    },
    dirty: [],
    interactionLayer: "content",
    layoutMode: "none",
    localRect: rect,
    nodeId: sectionId,
    parentSectionId: null,
    portAnchors: [],
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions: ["right", "bottom", "bottomRight"],
      locked: false,
      maxHeight: 100_000,
      maxWidth: 100_000,
      minHeight: 0,
      minWidth: 0,
    },
    scrollOffset: { x: 0, y: 0 },
    sectionId,
    worldRect: rect,
  } satisfies GpuSectionSceneNode;
}
