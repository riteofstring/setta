// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { attachGpuRetainedContentKeyboardController } from "./retainedContentKeyboard";

describe("GPU retained content keyboard controller", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("routes retained row keyboard navigation through row-order metadata", () => {
    const element = createHostElement();
    const onNavigation = vi.fn();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentKeyboardController({
      element,
      getCurrentTarget: () => ({
        ownerSectionId: "dict-a",
        rowId: "param-2",
        surfaceId: "dict-a:param-content:unpinned",
      }),
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => new Map(),
      onNavigation,
      requestFrame,
    });

    const event = createKeyboardEvent("PageDown");
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        scrollOffsets: expect.any(Map),
        target: {
          ownerSectionId: "dict-a",
          rowId: "param-4",
          rowIndex: 4,
          surfaceId: "dict-a:param-content:unpinned",
        },
      }),
    );
    expect(
      onNavigation.mock.calls[0]?.[0].scrollOffsets.get(
        "dict-a:param-content:unpinned",
      ),
    ).toEqual({ x: 0, y: 84 });
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    cleanup();
  });

  it("preserves native keyboard targets", () => {
    const element = createHostElement();
    const input = document.createElement("input");
    const domIsland = document.createElement("div");
    domIsland.dataset.gpuFlowDomIsland = "true";
    const interactiveControl = document.createElement("div");
    interactiveControl.dataset.gpuFlowInteractive = "true";
    const portalRoot = document.createElement("div");
    portalRoot.dataset.gpuFlowPortalRoot = "true";
    const portalOption = document.createElement("div");
    portalRoot.append(portalOption);
    element.append(input, domIsland, interactiveControl, portalRoot);
    const onNavigation = vi.fn();
    const cleanup = attachGpuRetainedContentKeyboardController({
      element,
      getCurrentTarget: () => ({
        ownerSectionId: "dict-a",
        rowId: "param-2",
        surfaceId: "dict-a:param-content:unpinned",
      }),
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => new Map(),
      onNavigation,
    });

    const preservedTargets = [
      input,
      domIsland,
      interactiveControl,
      portalOption,
    ];
    for (const target of preservedTargets) {
      const event = createKeyboardEvent("ArrowDown");
      target.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    }
    expect(onNavigation).not.toHaveBeenCalled();

    cleanup();
  });
});

function createHostElement(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
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
  const rect = { height: 60, width: 160, x: 0, y: 0 };
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

function createKeyboardEvent(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
  });
}
