// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "../scene";
import { resolveGpuFlowSceneLayout } from "../sceneLayout";
import type { GpuSectionSceneScrollOffsetMap } from "../sceneScroll";
import type { GpuPoint, GpuRect } from "../viewportMath";
import { attachGpuSectionSceneScrollController } from "./sceneScroll";

describe("GPU section scene scroll controller", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("routes page-key scrolling through renderer-owned scene offsets", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const scene = scrollableScene();
    let scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map();
    const requestFrame = vi.fn();
    const cleanup = attachGpuSectionSceneScrollController({
      element,
      getKeyboardScrollParentSectionId: () => "parent",
      getScene: () => scene,
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
      requestFrame,
    });

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollOffsets.get("parent")).toEqual({
      x: 0,
      y: 66,
    });
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    cleanup();
  });

  it("preserves native keyboard targets inside active DOM islands", () => {
    const element = document.createElement("div");
    const input = document.createElement("input");
    element.append(input);
    document.body.append(element);
    let scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map();
    const cleanup = attachGpuSectionSceneScrollController({
      element,
      getKeyboardScrollParentSectionId: () => "parent",
      getScene: () => scrollableScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(scrollOffsets.size).toBe(0);

    cleanup();
  });
});

function scrollableScene(): GpuFlowScene {
  return resolveGpuFlowSceneLayout(
    sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b", "child-c"],
        childLayoutGap: { x: 0, y: 8 },
        id: "parent",
        layoutMode: "vertical",
        worldRect: rect(0, 0, 100, 100),
      }),
      sectionNode({
        id: "child-a",
        localRect: rect(0, 0, 80, 50),
        parentId: "parent",
      }),
      sectionNode({
        id: "child-b",
        localRect: rect(0, 0, 80, 50),
        parentId: "parent",
      }),
      sectionNode({
        id: "child-c",
        localRect: rect(0, 0, 80, 50),
        parentId: "parent",
      }),
    ]),
  );
}

function sceneWithSections(
  sections: readonly GpuSectionSceneNode[],
): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections,
  };
}

function sectionNode({
  childIds = [],
  childLayoutGap = { x: 0, y: 0 },
  id,
  layoutMode = "none",
  localRect,
  parentId = null,
  scrollOffset = { x: 0, y: 0 },
  worldRect = rect(0, 0, 100, 100),
}: {
  readonly childIds?: readonly string[] | undefined;
  readonly childLayoutGap?: GpuPoint | undefined;
  readonly id: string;
  readonly layoutMode?: GpuSectionSceneLayoutMode | undefined;
  readonly localRect?: GpuRect | undefined;
  readonly parentId?: string | null | undefined;
  readonly scrollOffset?: GpuPoint | undefined;
  readonly worldRect?: GpuRect | undefined;
}): GpuSectionSceneNode {
  return {
    bodyRect: worldRect,
    childLayout: { gap: childLayoutGap },
    childSectionIds: childIds,
    childViewportRect: childIds.length > 0 ? worldRect : null,
    chromeRect: worldRect,
    clipRect: worldRect,
    contentRenderer: { kind: "dom-section", surfaceId: id },
    dirty: [],
    height: worldRect.height,
    interactionLayer: "content",
    layoutMode,
    localRect: localRect ?? worldRect,
    nodeId: id,
    parentSectionId: parentId,
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
    scrollOffset,
    sectionId: id,
    width: worldRect.width,
    worldRect,
    x: worldRect.x,
    y: worldRect.y,
    zIndex: 0,
  };
}

function rect(x: number, y: number, width: number, height: number): GpuRect {
  return { height, width, x, y };
}
