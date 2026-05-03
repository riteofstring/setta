// @vitest-environment jsdom

import { NO_PAN_CLASS_NAME } from "utils/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
} from "../retainedContentScene";
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
    const domIsland = document.createElement("div");
    domIsland.dataset.gpuFlowDomIsland = "true";
    const domIslandInput = document.createElement("input");
    domIsland.append(domIslandInput);
    const interactiveControl = document.createElement("div");
    interactiveControl.dataset.gpuFlowInteractive = "true";
    const interactiveButton = document.createElement("button");
    interactiveControl.append(interactiveButton);
    const portalRoot = document.createElement("div");
    portalRoot.dataset.gpuFlowPortalRoot = "true";
    portalRoot.dataset.gpuFlowRetainedContentNative = "true";
    const portalOption = document.createElement("button");
    portalRoot.append(portalOption);
    element.append(domIsland, interactiveControl, portalRoot);
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

    const preservedTargets = [domIslandInput, interactiveButton, portalOption];
    for (const target of preservedTargets) {
      const event = createKeyboardEvent("ArrowDown");
      target.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    }
    expect(onNavigation).not.toHaveBeenCalled();

    cleanup();
  });

  it("preserves non-portal no-pan keyboard targets", () => {
    const element = createHostElement();
    const nativeTarget = document.createElement("button");
    nativeTarget.classList.add(NO_PAN_CLASS_NAME);
    element.append(nativeTarget);
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

    const event = createKeyboardEvent("ArrowDown");
    nativeTarget.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onNavigation).not.toHaveBeenCalled();

    cleanup();
  });

  it("does not preserve plain GpuFlow portal buttons as native keyboard targets", () => {
    const element = createHostElement();
    const portalRoot = document.createElement("div");
    portalRoot.classList.add(NO_PAN_CLASS_NAME);
    portalRoot.dataset.gpuFlowPortalRoot = "true";
    const portalOption = document.createElement("button");
    portalRoot.append(portalOption);
    element.append(portalRoot);
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

    const event = createKeyboardEvent("ArrowDown");
    portalOption.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onNavigation).toHaveBeenCalledTimes(1);

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

function createKeyboardEvent(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
  });
}
