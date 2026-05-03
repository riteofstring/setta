// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuRetainedContentInteractionController,
  hitTestGpuRetainedContentInteraction,
} from "./retainedContentInteraction";

describe("GPU retained content interaction controller", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("emits retained content clicks from generated hit records", () => {
    const element = createHostElement();
    const store = createGpuFlowViewportStore();
    const onHitClick = vi.fn();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      requestFrame,
      store,
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 140,
      clientY: 14,
      pointerId: 1,
    });
    const pointerUp = createPointerEvent("pointerup", {
      clientX: 140,
      clientY: 14,
      pointerId: 1,
    });
    element.dispatchEvent(pointerDown);
    element.dispatchEvent(pointerUp);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(pointerUp.defaultPrevented).toBe(true);
    expect(onHitClick).toHaveBeenCalledWith(
      expect.objectContaining({
        hit: expect.objectContaining({
          id: "control:param-0",
          kind: "control",
          ownerRowId: "param-0",
        }),
        ownerSectionId: "dict-a",
        screenPoint: { x: 140, y: 14 },
        surfaceId: "dict-a:param-content:unpinned",
      }),
    );
    expect(requestFrame).toHaveBeenCalledWith("manual");

    cleanup();
  });

  it("does not emit clicks from pointer drags", () => {
    const element = createHostElement();
    const onHitClick = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      store: createGpuFlowViewportStore(),
    });

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 20,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 60,
        clientY: 14,
        pointerId: 1,
      }),
    );

    expect(onHitClick).not.toHaveBeenCalled();

    cleanup();
  });

  it("preserves native active DOM island targets", () => {
    const element = createHostElement();
    const input = document.createElement("input");
    element.append(input);
    const onHitClick = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      store: createGpuFlowViewportStore(),
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 20,
      clientY: 14,
      pointerId: 1,
    });
    input.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(onHitClick).not.toHaveBeenCalled();

    cleanup();
  });

  it("can hit test retained content interaction without attaching listeners", () => {
    const element = createHostElement();
    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointermove", {
        clientX: 20,
        clientY: 42,
        pointerId: 1,
      }),
      getScene: () => retainedContentScene(),
      store: createGpuFlowViewportStore(),
    });

    expect(hit).toMatchObject({
      hit: {
        id: "row:param-1",
        kind: "row",
        ownerRowId: "param-1",
      },
      localPoint: { x: 20, y: 42 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });
});

function createHostElement(): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      bottom: 120,
      height: 120,
      left: 0,
      right: 240,
      top: 0,
      width: 240,
      x: 0,
      y: 0,
    }),
  });
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
      controlWidth: 40,
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: Array.from({ length: 4 }, (_, index) => ({
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

function createPointerEvent(
  type: string,
  init: {
    readonly button?: number | undefined;
    readonly buttons?: number | undefined;
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerId: number;
  },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    buttons: { value: init.buttons ?? (type === "pointerup" ? 0 : 1) },
    isPrimary: { value: true },
    pointerId: { value: init.pointerId },
    pointerType: { value: "mouse" },
  });
  return event;
}
