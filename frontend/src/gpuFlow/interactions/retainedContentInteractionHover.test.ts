// @vitest-environment jsdom

import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
} from "../retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { createGpuFlowViewportStore } from "../viewportStore";
import { attachGpuRetainedContentInteractionController } from "./retainedContentInteraction";

describe("GPU retained content hover interaction", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("re-emits unchanged hover hits until retained row hover state catches up", () => {
    const element = createHostElement();
    const onHitPointerMove = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerMove,
      shouldHandlePointerMoveHit: () => true,
      store: createGpuFlowViewportStore(),
    });

    dispatchHoverMove(element);
    dispatchHoverMove(element);

    expect(onHitPointerMove).toHaveBeenCalledTimes(2);
    expect(onHitPointerMove).toHaveBeenNthCalledWith(2, {
      hit: expect.objectContaining({
        surfaceId: "dict-a:param-content:unpinned",
      }),
      nativeEvent: expect.any(MouseEvent),
    });

    cleanup();
  });

  it("clears hover hits when wheel gestures begin without a pointer leave", () => {
    const element = createHostElement();
    const onHitPointerLeave = vi.fn();
    const onHitPointerMove = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerLeave,
      onHitPointerMove,
      shouldHandlePointerMoveHit: () => true,
      store: createGpuFlowViewportStore(),
    });

    dispatchHoverMove(element);
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: -5 }));

    expect(onHitPointerMove).toHaveBeenCalledTimes(1);
    expect(onHitPointerLeave).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("clears hover hits while viewport interactions are active", () => {
    const element = createHostElement();
    const onHitPointerLeave = vi.fn();
    const onHitPointerMove = vi.fn();
    const store = createGpuFlowViewportStore();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerLeave,
      onHitPointerMove,
      shouldHandlePointerMoveHit: () => true,
      store,
    });

    element.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 20,
        clientY: 14,
        pointerId: 1,
      }),
    );
    store.getState().setViewportInteractionFlags({ panScrolling: true });
    dispatchHoverMove(element);

    expect(onHitPointerMove).toHaveBeenCalledTimes(1);
    expect(onHitPointerMove).toHaveBeenCalledWith({
      hit: expect.objectContaining({
        surfaceId: "dict-a:param-content:unpinned",
      }),
      nativeEvent: expect.any(MouseEvent),
    });
    expect(onHitPointerLeave).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("replays a skipped hover move after viewport interactions settle", async () => {
    const element = createHostElement();
    const onHitPointerMove = vi.fn();
    const store = createGpuFlowViewportStore();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerMove,
      shouldHandlePointerMoveHit: () => true,
      store,
    });

    store.getState().setViewportInteractionFlags({ panScrolling: true });
    dispatchHoverMove(element);
    store.getState().setViewportInteractionFlags({ panScrolling: false });
    await nextAnimationFrame();

    expect(onHitPointerMove).toHaveBeenCalledTimes(1);
    expect(onHitPointerMove).toHaveBeenCalledWith({
      hit: expect.objectContaining({
        hit: expect.objectContaining({
          ownerRowId: "param-1",
        }),
        surfaceId: "dict-a:param-content:unpinned",
      }),
      nativeEvent: expect.any(MouseEvent),
    });

    cleanup();
  });
});

function dispatchHoverMove(element: HTMLElement): void {
  element.dispatchEvent(
    createPointerEvent("pointermove", {
      buttons: 0,
      clientX: 20,
      clientY: 42,
      pointerId: 1,
    }),
  );
}

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

async function nextAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
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
    policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
    rendererFamily: "text-like",
    commitPolicy: "native-island",
  };
}

function createPointerEvent(
  type: string,
  init: {
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
    button: { value: 0 },
    buttons: { value: init.buttons ?? 1 },
    isPrimary: { value: true },
    pointerId: { value: init.pointerId },
    pointerType: { value: "mouse" },
  });
  return event;
}
