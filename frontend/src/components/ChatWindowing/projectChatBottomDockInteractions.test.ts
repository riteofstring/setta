import { describe, expect, it } from "vitest";
import {
  collectStripItemLayoutAnimations,
  resolveFloatingDragMove,
  resolveSingleDockResizeMetrics,
} from "./projectChatBottomDockInteractions";

function createRect({
  left,
  top,
  width = 0,
  height = 0,
}: {
  left: number;
  top: number;
  width?: number;
  height?: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function createNode(rect: DOMRect): HTMLElement {
  return {
    dataset: {},
    style: {},
    getBoundingClientRect: () => rect,
  } as unknown as HTMLElement;
}

describe("collectStripItemLayoutAnimations", () => {
  it("returns move animations for pills whose measured position changed", () => {
    const node = createNode(createRect({ left: 80, top: 60, width: 20 }));
    const result = collectStripItemLayoutAnimations({
      renderedStripItemKeys: ["chat-1"],
      nodesByItemKey: { "chat-1": node },
      previousRectsByItemKey: {
        "chat-1": createRect({ left: 100, top: 90, width: 20 }),
      },
      hasMounted: true,
    });

    expect(result.nextRectsByItemKey["chat-1"]).toBe(
      node.getBoundingClientRect(),
    );
    expect(result.animations).toEqual([
      {
        itemKey: "chat-1",
        node,
        initialTransform: "translate(20px, 30px)",
        finalTransform: "translate(0px, 0px)",
      },
    ]);
  });

  it("only returns enter animations after the strip has mounted", () => {
    const node = createNode(createRect({ left: 24, top: 12, width: 20 }));

    const beforeMount = collectStripItemLayoutAnimations({
      renderedStripItemKeys: ["chat-1"],
      nodesByItemKey: { "chat-1": node },
      previousRectsByItemKey: {},
      hasMounted: false,
    });
    const afterMount = collectStripItemLayoutAnimations({
      renderedStripItemKeys: ["chat-1"],
      nodesByItemKey: { "chat-1": node },
      previousRectsByItemKey: {},
      hasMounted: true,
    });

    expect(beforeMount.animations).toEqual([]);
    expect(afterMount.animations).toEqual([
      {
        itemKey: "chat-1",
        node,
        initialTransform: "translateY(8px) scale(0.96)",
        finalTransform: "translateY(0px) scale(1)",
      },
    ]);
  });
});

describe("resolveFloatingDragMove", () => {
  const activeDrag = {
    instanceId: "chat-1",
    startX: 100,
    startY: 100,
    startBounds: { x: 0, y: 0, width: 320, height: 280 },
    dragBoundsStart: { x: 180, y: 120, width: 320, height: 280 },
    restoreBoundsOnUnsnap: { x: 180, y: 120, width: 320, height: 280 },
    hasActivatedUnsnap: false,
  } as const;

  it("keeps a snapped window on its snap bounds until the unsnap threshold is crossed", () => {
    const result = resolveFloatingDragMove({
      activeDrag: { ...activeDrag },
      pointerX: 104,
      pointerY: 103,
      unsnapThresholdPx: 6,
      viewportWidthPx: null,
      viewportHeightPx: null,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
      clampBounds: (bounds) => bounds,
    });

    expect(result.hasActivatedUnsnap).toBe(false);
    expect(result.nextBounds).toEqual({
      x: 4,
      y: 3,
      width: 320,
      height: 280,
    });
    expect(result.nextSnapPreview).toBeNull();
  });

  it("switches to unsnapped bounds and returns a snap preview once the threshold is crossed", () => {
    const result = resolveFloatingDragMove({
      activeDrag: { ...activeDrag },
      pointerX: 10,
      pointerY: 10,
      unsnapThresholdPx: 6,
      viewportWidthPx: 1000,
      viewportHeightPx: 800,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
      clampBounds: (bounds) => bounds,
    });

    expect(result.hasActivatedUnsnap).toBe(true);
    expect(result.nextBounds).toEqual({
      x: 90,
      y: 30,
      width: 320,
      height: 280,
    });
    expect(result.nextSnapPreview).toEqual({
      instanceId: "chat-1",
      preset: "top_left",
      bounds: {
        x: 0,
        y: 0,
        width: 500,
        height: 400,
      },
    });
  });
});

describe("resolveSingleDockResizeMetrics", () => {
  it("prefers live panel bounds and clamps the resize height to the viewport", () => {
    expect(
      resolveSingleDockResizeMetrics({
        panelBounds: createRect({ left: 0, top: 0, width: 640, height: 900 }),
        resolvedWidthPx: 520,
        resolvedHeightPx: 700,
        viewportHeightPx: 800,
        workspaceTopInsetPx: 120,
        dockBottomOffsetPx: 40,
        dockAvailableHeightPx: 900,
        defaultWidthPx: 460,
        defaultHeightPx: 520,
        minHeightPx: 220,
      }),
    ).toEqual({
      startWidthPx: 640,
      startHeightPx: 900,
      maxHeightPx: 640,
    });
  });
});
