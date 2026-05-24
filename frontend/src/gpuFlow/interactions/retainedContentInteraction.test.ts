// @vitest-environment jsdom

import { NO_PAN_CLASS_NAME } from "utils/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGpuFlowStartupCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { createGpuFlowViewportStore } from "../viewportStore";
import { attachGpuRetainedContentInteractionController } from "./retainedContentInteraction";
import {
  createHostElement,
  createMouseEvent,
  createPointerEvent,
  retainedContentScene,
} from "./retainedContentInteraction.testHelpers";

describe("GPU retained content interaction controller", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
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

  it("emits retained content pointer-down activation from mouse-only input", () => {
    const element = createHostElement();
    const onHitPointerDown = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerDown,
      store: createGpuFlowViewportStore(),
    });

    element.dispatchEvent(
      createMouseEvent("mousedown", {
        clientX: 140,
        clientY: 14,
      }),
    );

    expect(onHitPointerDown).toHaveBeenCalledWith(
      expect.objectContaining({
        hit: expect.objectContaining({
          id: "control:param-0",
          kind: "control",
          ownerRowId: "param-0",
        }),
        nativeEvent: expect.any(MouseEvent),
        ownerSectionId: "dict-a",
        screenPoint: { x: 140, y: 14 },
        surfaceId: "dict-a:param-content:unpinned",
      }),
    );

    cleanup();
  });

  it("does not duplicate pointer-down activation when pointer input is present", () => {
    const element = createHostElement();
    const onHitPointerDown = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerDown,
      store: createGpuFlowViewportStore(),
    });

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createMouseEvent("mousedown", {
        clientX: 140,
        clientY: 14,
      }),
    );

    expect(onHitPointerDown).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("suppresses the browser click that follows a retained content click", () => {
    const element = createHostElement();
    const onHitClick = vi.fn();
    const onBackgroundClick = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      store: createGpuFlowViewportStore(),
    });
    element.addEventListener("click", onBackgroundClick);

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    const click = createMouseEvent("click", {
      clientX: 140,
      clientY: 14,
    });
    element.dispatchEvent(click);

    expect(onHitClick).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(true);
    expect(onBackgroundClick).not.toHaveBeenCalled();

    cleanup();
  });

  it("keeps non-drag click candidates through early pointer capture loss", () => {
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
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("lostpointercapture", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );

    expect(onHitClick).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("emits the pointerdown hit when pointerup is transiently rejected", () => {
    const element = createHostElement();
    const onHitClick = vi.fn();
    let acceptHits = true;
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      shouldHandleHit: (hit) => acceptHits && hit.hit.kind === "control",
      store: createGpuFlowViewportStore(),
    });

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    acceptHits = false;
    element.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );

    expect(onHitClick).toHaveBeenCalledWith(
      expect.objectContaining({
        hit: expect.objectContaining({
          id: "control:param-0",
          kind: "control",
          ownerRowId: "param-0",
        }),
      }),
    );

    cleanup();
  });

  it("suppresses the browser click when pointerup lands on a mounted native island", () => {
    const element = createHostElement();
    const domIsland = document.createElement("div");
    domIsland.dataset.gpuFlowDomIsland = "true";
    const domIslandInput = document.createElement("input");
    domIsland.append(domIslandInput);
    element.append(domIsland);
    const onHitClick = vi.fn();
    const onBackgroundClick = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      store: createGpuFlowViewportStore(),
    });
    element.addEventListener("click", onBackgroundClick);

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    domIslandInput.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    const click = createMouseEvent("click", {
      clientX: 140,
      clientY: 14,
    });
    element.dispatchEvent(click);

    expect(onHitClick).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
    expect(onBackgroundClick).not.toHaveBeenCalled();

    cleanup();
  });

  it("does not suppress a later DOM click at a different point", () => {
    const element = createHostElement();
    const onBackgroundClick = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick: vi.fn(),
      store: createGpuFlowViewportStore(),
    });
    element.addEventListener("click", onBackgroundClick);

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );
    const click = createMouseEvent("click", {
      clientX: 220,
      clientY: 70,
    });
    element.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);

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

  it("does not suppress later DOM clicks after a retained content drag", () => {
    const element = createHostElement();
    const onBackgroundClick = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitDragStart: vi.fn(),
      shouldStartDrag: (hit) => hit.hit.kind === "row",
      store: createGpuFlowViewportStore(),
    });
    element.addEventListener("click", onBackgroundClick);

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 116,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 1,
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
    );
    const click = createMouseEvent("click", {
      clientX: 116,
      clientY: 42,
    });
    element.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("emits retained content drags from generated row hit records", () => {
    const element = createHostElement();
    const onHitClick = vi.fn();
    const onHitDragStart = vi.fn();
    const onHitDragMove = vi.fn();
    const onHitDragEnd = vi.fn();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      onHitDragEnd,
      onHitDragMove,
      onHitDragStart,
      requestFrame,
      shouldHandleDragMoveHit: (hit) => hit.hit.kind === "row",
      shouldStartDrag: (hit) => hit.hit.kind === "row",
      store: createGpuFlowViewportStore(),
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 116,
      clientY: 14,
      pointerId: 1,
    });
    const pointerMove = createPointerEvent("pointermove", {
      buttons: 1,
      clientX: 116,
      clientY: 42,
      pointerId: 1,
    });
    const pointerUp = createPointerEvent("pointerup", {
      clientX: 116,
      clientY: 70,
      pointerId: 1,
    });

    element.dispatchEvent(pointerDown);
    element.dispatchEvent(pointerMove);
    element.dispatchEvent(pointerUp);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(pointerMove.defaultPrevented).toBe(true);
    expect(pointerUp.defaultPrevented).toBe(true);
    expect(onHitDragStart).toHaveBeenCalledWith(
      expect.objectContaining({
        hit: expect.objectContaining({
          id: "row:param-0",
          kind: "row",
          ownerRowId: "param-0",
        }),
      }),
    );
    expect(onHitDragMove).toHaveBeenCalledWith(
      expect.objectContaining({
        activeHit: expect.objectContaining({
          hit: expect.objectContaining({ ownerRowId: "param-0" }),
        }),
        flowPoint: { x: 116, y: 42 },
        hit: expect.objectContaining({
          hit: expect.objectContaining({ ownerRowId: "param-1" }),
        }),
      }),
    );
    expect(onHitDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        activeHit: expect.objectContaining({
          hit: expect.objectContaining({ ownerRowId: "param-0" }),
        }),
        hit: expect.objectContaining({
          hit: expect.objectContaining({ ownerRowId: "param-2" }),
        }),
      }),
    );
    expect(onHitClick).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledWith("manual");

    cleanup();
  });

  it("maps retained drag flow points through the visible projection sample", () => {
    const element = createHostElement();
    const scene = retainedContentScene();
    const retainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene,
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });
    const committedFrame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame,
    });
    const visibleProjectionState = createGpuFlowVisibleProjectionState({
      committedFrame,
      transaction: createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: committedFrame.displayFrameId,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["viewport"],
        sample: {
          cssViewport: { height: 120, width: 240 },
          devicePixelRatio: 1,
          gestureOwner: "idle",
          id: 4,
          retainedScrollDelta: new Map(),
          retainedScrollOffsets: new Map(),
          retainedScrollRevision: 0,
          retainedScrollVelocityCssPxPerMs: new Map(),
          timestamp: 4,
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportDelta: { x: 0, y: 0, zoom: 0 },
          viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
        },
      }),
    });
    const store = createGpuFlowViewportStore({
      transform: [100, 0, 1],
    });
    const onHitDragMove = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getRetainedRuntimeFrame: () => retainedRuntimeFrame,
      getScene: () => scene,
      getVisibleProjectionState: () => visibleProjectionState,
      onHitDragMove,
      shouldHandleDragMoveHit: (hit) => hit.hit.kind === "row",
      shouldStartDrag: (hit) => hit.hit.kind === "row",
      store,
    });

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 116,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 1,
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
    );

    expect(onHitDragMove).toHaveBeenCalledWith(
      expect.objectContaining({
        flowPoint: { x: 116, y: 42 },
      }),
    );

    cleanup();
  });

  it("falls back to the current scene when a stale projected hit is rejected", () => {
    const element = createHostElement();
    const scene = retainedContentScene();
    const retainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene,
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [40, 0, 1],
      viewportZoomBucket: 1,
    });
    const committedFrame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame,
    });
    const visibleProjectionState = createGpuFlowVisibleProjectionState({
      committedFrame,
      transaction: createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: committedFrame.displayFrameId,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["viewport"],
        sample: {
          cssViewport: { height: 120, width: 240 },
          devicePixelRatio: 1,
          gestureOwner: "idle",
          id: 4,
          retainedScrollDelta: new Map(),
          retainedScrollOffsets: new Map(),
          retainedScrollRevision: 0,
          retainedScrollVelocityCssPxPerMs: new Map(),
          timestamp: 4,
          viewport: { x: 40, y: 0, zoom: 1 },
          viewportDelta: { x: 0, y: 0, zoom: 0 },
          viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
        },
      }),
    });
    const onHitPointerDown = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getRetainedRuntimeFrame: () => retainedRuntimeFrame,
      getScene: () => scene,
      getVisibleProjectionState: () => visibleProjectionState,
      onHitPointerDown,
      shouldHandleHit: (hit) => hit.hit.kind === "control",
      store: createGpuFlowViewportStore({ transform: [0, 0, 1] }),
    });

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
    );

    expect(onHitPointerDown).toHaveBeenCalledWith(
      expect.objectContaining({
        hit: expect.objectContaining({
          id: "control:param-0",
          kind: "control",
          ownerRowId: "param-0",
        }),
        localPoint: { x: 140, y: 14 },
      }),
    );

    cleanup();
  });

  it("emits retained drag frames from the latest pointer position", () => {
    vi.useFakeTimers();
    const element = createHostElement();
    const onHitDragFrame = vi.fn(() => true);
    const onHitDragStart = vi.fn();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitDragFrame,
      onHitDragStart,
      requestFrame,
      shouldStartDrag: (hit) => hit.hit.kind === "row",
      store: createGpuFlowViewportStore(),
    });

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 116,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 1,
        clientX: 116,
        clientY: 76,
        pointerId: 1,
      }),
    );
    vi.advanceTimersByTime(16);

    expect(onHitDragStart).toHaveBeenCalled();
    expect(onHitDragFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        flowPoint: { x: 116, y: 76 },
        screenPoint: { x: 116, y: 76 },
      }),
    );
    expect(requestFrame).toHaveBeenCalledWith("manual");

    cleanup();
    vi.useRealTimers();
  });

  it("cancels the active retained pointer when pointer capture is lost", () => {
    const element = createHostElement();
    const capturedPointerIds = new Set<number>();
    const onHitClick = vi.fn();
    const onHitDragCancel = vi.fn();
    const onHitDragEnd = vi.fn();
    const onHitDragStart = vi.fn();
    const requestFrame = vi.fn();
    element.setPointerCapture = vi.fn((pointerId: number) => {
      capturedPointerIds.add(pointerId);
    });
    element.releasePointerCapture = vi.fn((pointerId: number) => {
      capturedPointerIds.delete(pointerId);
    });
    element.hasPointerCapture = vi.fn((pointerId: number) =>
      capturedPointerIds.has(pointerId),
    );
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      onHitDragCancel,
      onHitDragEnd,
      onHitDragStart,
      requestFrame,
      shouldStartDrag: (hit) => hit.hit.kind === "row",
      store: createGpuFlowViewportStore(),
    });

    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 116,
        clientY: 14,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 1,
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
    );
    capturedPointerIds.delete(1);
    element.dispatchEvent(
      createPointerEvent("lostpointercapture", {
        buttons: 0,
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 2,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 140,
        clientY: 14,
        pointerId: 2,
      }),
    );

    expect(onHitDragStart).toHaveBeenCalledTimes(1);
    expect(onHitDragCancel).toHaveBeenCalledWith(
      expect.objectContaining({
        activeHit: expect.objectContaining({
          hit: expect.objectContaining({ ownerRowId: "param-0" }),
        }),
      }),
    );
    expect(onHitDragEnd).not.toHaveBeenCalled();
    expect(onHitClick).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledWith("manual");

    cleanup();
  });

  it("lets callers gate which retained hits take pointer ownership", () => {
    const element = createHostElement();
    const onHitClick = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      shouldHandleHit: (hit) => hit.hit.kind === "control",
      store: createGpuFlowViewportStore(),
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 116,
      clientY: 42,
      pointerId: 1,
    });
    const pointerUp = createPointerEvent("pointerup", {
      clientX: 20,
      clientY: 42,
      pointerId: 1,
    });
    element.dispatchEvent(pointerDown);
    element.dispatchEvent(pointerUp);

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(pointerUp.defaultPrevented).toBe(false);
    expect(onHitClick).not.toHaveBeenCalled();

    cleanup();
  });

  it("reports pointer misses without taking pointer ownership", () => {
    const element = createHostElement();
    const onPointerDownMiss = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onPointerDownMiss,
      shouldHandleHit: (hit) => hit.hit.kind === "control",
      store: createGpuFlowViewportStore(),
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 20,
      clientY: 42,
      pointerId: 1,
    });
    element.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(onPointerDownMiss).toHaveBeenCalledWith({
      nativeEvent: pointerDown,
      screenPoint: { x: 20, y: 42 },
    });

    cleanup();
  });

  it("can expose hover hits separately from pointer ownership hits", () => {
    const element = createHostElement();
    const onHitPointerLeave = vi.fn();
    const onHitPointerMove = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerLeave,
      onHitPointerMove,
      shouldHandleHit: (hit) => hit.hit.kind === "control",
      shouldHandlePointerMoveHit: (hit) => hit.hit.kind === "row",
      store: createGpuFlowViewportStore(),
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 20,
      clientY: 42,
      pointerId: 1,
    });
    element.dispatchEvent(pointerDown);
    element.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 220,
        clientY: 42,
        pointerId: 1,
      }),
    );
    element.dispatchEvent(
      createPointerEvent("pointerleave", {
        buttons: 0,
        clientX: 220,
        clientY: 42,
        pointerId: 1,
      }),
    );

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(onHitPointerMove).toHaveBeenNthCalledWith(1, {
      hit: expect.objectContaining({
        hit: expect.objectContaining({
          id: "row:param-1",
          kind: "row",
          ownerRowId: "param-1",
        }),
      }),
      nativeEvent: expect.any(MouseEvent),
    });
    expect(onHitPointerMove).toHaveBeenNthCalledWith(2, {
      hit: null,
      nativeEvent: expect.any(MouseEvent),
    });
    expect(onHitPointerLeave).not.toHaveBeenCalled();

    cleanup();
  });

  it("preserves explicit retained native targets", () => {
    const element = createHostElement();
    const domIsland = document.createElement("div");
    domIsland.dataset.gpuFlowDomIsland = "true";
    const domIslandInput = document.createElement("input");
    domIsland.append(domIslandInput);
    const domControl = document.createElement("div");
    domControl.dataset.gpuFlowDomControl = "true";
    const domControlInput = document.createElement("input");
    domControl.append(domControlInput);
    const explicitNativeTarget = document.createElement("div");
    explicitNativeTarget.dataset.gpuFlowRetainedContentNative = "true";
    const explicitNativeButton = document.createElement("button");
    explicitNativeTarget.append(explicitNativeButton);
    const portalRoot = document.createElement("div");
    portalRoot.dataset.gpuFlowPortalRoot = "true";
    portalRoot.dataset.gpuFlowRetainedContentNative = "true";
    const portalOption = document.createElement("button");
    portalRoot.append(portalOption);
    element.append(domIsland, domControl, explicitNativeTarget, portalRoot);
    const onHitClick = vi.fn();
    const onPointerDownMiss = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitClick,
      onPointerDownMiss,
      store: createGpuFlowViewportStore(),
    });

    const preservedTargets = [
      domIslandInput,
      domControlInput,
      explicitNativeButton,
      portalOption,
    ];
    for (const [index, target] of preservedTargets.entries()) {
      const pointerDown = createPointerEvent("pointerdown", {
        clientX: 20,
        clientY: 14,
        pointerId: index + 1,
      });
      target.dispatchEvent(pointerDown);

      expect(pointerDown.defaultPrevented).toBe(false);
    }
    expect(onHitClick).not.toHaveBeenCalled();
    expect(onPointerDownMiss).not.toHaveBeenCalled();

    cleanup();
  });

  it("does not preserve generic source-surface interactive targets", () => {
    const element = createHostElement();
    const interactiveControl = document.createElement("div");
    interactiveControl.dataset.gpuFlowInteractive = "true";
    const interactiveButton = document.createElement("button");
    interactiveControl.append(interactiveButton);
    element.append(interactiveControl);
    const onHitPointerDown = vi.fn();
    const onPointerDownMiss = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerDown,
      onPointerDownMiss,
      store: createGpuFlowViewportStore(),
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 20,
      clientY: 14,
      pointerId: 1,
    });
    interactiveButton.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(onHitPointerDown).toHaveBeenCalledTimes(1);
    expect(onPointerDownMiss).not.toHaveBeenCalled();

    cleanup();
  });

  it("does not preserve non-portal no-pan targets", () => {
    const element = createHostElement();
    const nativeTarget = document.createElement("button");
    nativeTarget.classList.add(NO_PAN_CLASS_NAME);
    element.append(nativeTarget);
    const onHitPointerDown = vi.fn();
    const onPointerDownMiss = vi.fn();
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      onHitPointerDown,
      onPointerDownMiss,
      store: createGpuFlowViewportStore(),
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 20,
      clientY: 14,
      pointerId: 1,
    });
    nativeTarget.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(onHitPointerDown).toHaveBeenCalledTimes(1);
    expect(onPointerDownMiss).not.toHaveBeenCalled();

    cleanup();
  });

  it("does not preserve plain GpuFlow portal buttons as native pointer targets", () => {
    const element = createHostElement();
    const portalRoot = document.createElement("div");
    portalRoot.classList.add(NO_PAN_CLASS_NAME);
    portalRoot.dataset.gpuFlowPortalRoot = "true";
    const portalOption = document.createElement("button");
    portalRoot.append(portalOption);
    element.append(portalRoot);
    const cleanup = attachGpuRetainedContentInteractionController({
      element,
      getScene: () => retainedContentScene(),
      store: createGpuFlowViewportStore(),
    });

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 20,
      clientY: 14,
      pointerId: 1,
    });
    portalOption.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);

    cleanup();
  });
});
