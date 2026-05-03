// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
} from "../retainedContentScene";
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

  it.each(preservedWheelTargetCases)(
    "preserves wheel events from %s",
    (_name, createTarget) => {
      const element = document.createElement("div");
      const { root, target } = createTarget();
      element.append(root);
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
      target.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(scrollOffsets.size).toBe(0);

      cleanup();
    },
  );

  it("does not preserve plain GpuFlow portal buttons as native wheel targets", () => {
    const element = document.createElement("div");
    const { root, target } = createMarkedWheelTarget(
      "data-gpu-flow-portal-root",
      "button",
    );
    element.append(root);
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
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollOffsets.get("dict-a:param-content:unpinned")).toEqual({
      x: 0,
      y: 36,
    });

    cleanup();
  });
});

type PreservedWheelTargetFixture = {
  readonly root: HTMLElement;
  readonly target: HTMLElement;
};

const preservedWheelTargetCases: readonly [
  string,
  () => PreservedWheelTargetFixture,
][] = [
  [
    "native input targets inside explicit DOM island wrappers",
    () => createMarkedWheelTarget("data-gpu-flow-dom-island", "input"),
  ],
  [
    "custom interactive controls",
    () => createMarkedWheelTarget("data-gpu-flow-interactive", "button"),
  ],
  [
    "retained native portal roots",
    () =>
      createMarkedWheelTarget(
        "data-gpu-flow-retained-content-native",
        "button",
      ),
  ],
];

function createMarkedWheelTarget(
  attribute: string,
  tagName: "button" | "input" | "span" = "span",
): PreservedWheelTargetFixture {
  const root = document.createElement("div");
  root.setAttribute(attribute, "true");
  const target = document.createElement(tagName);
  root.append(target);
  return { root, target };
}

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
        control: textLikeControlDescriptor(`Value ${index}`),
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

function textLikeControlDescriptor(
  displayValue: string,
): GpuRetainedContentControlDescriptor {
  return {
    defaultDisplayValue: "",
    displayValue,
    editorKind: "text",
    kind: "text-like",
    rendererFamily: "text-like",
    commitPolicy: "native-island",
  };
}
