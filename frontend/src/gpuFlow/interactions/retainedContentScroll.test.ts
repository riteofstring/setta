// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { attachGpuRetainedContentScrollController } from "./retainedContentScroll";

describe("GPU retained content scroll controller", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("routes wheel scrolling through retained content offsets", () => {
    const element = document.createElement("div");
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
      requestFrame,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollOffsets.get("dict-a:param-content:unpinned")).toEqual({
      x: 0,
      y: 36,
    });
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    cleanup();
  });

  it("preserves native wheel targets inside active DOM islands", () => {
    const element = document.createElement("div");
    const input = document.createElement("input");
    element.append(input);
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(scrollOffsets.size).toBe(0);

    cleanup();
  });
});

function retainedContentScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface {
  const rect = { height: 80, width: 160, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: Array.from({ length: 10 }, (_, index) => ({
        controlKind: "text-like",
        depth: 0,
        id: `param-${index}`,
        label: `Param ${index}`,
      })),
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
}
