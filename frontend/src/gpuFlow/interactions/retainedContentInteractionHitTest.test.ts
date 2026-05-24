// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createGpuFlowStartupCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { createGpuFlowViewportStore } from "../viewportStore";
import { hitTestGpuRetainedContentInteraction } from "./retainedContentInteraction";
import {
  createHostElement,
  createPointerEvent,
  retainedContentScene,
  retainedSurface,
} from "./retainedContentInteraction.testHelpers";

describe("GPU retained content interaction hit testing", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("can hit test retained content interaction without attaching listeners", () => {
    const element = createHostElement();
    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointermove", {
        clientX: 116,
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
      localPoint: { x: 116, y: 42 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("does not fall back to scene-only hit testing when the runtime frame provider has no published frame", () => {
    const element = createHostElement();
    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointermove", {
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
      getRetainedRuntimeFrame: () => null,
      getScene: () => retainedContentScene(),
      store: createGpuFlowViewportStore(),
    });

    expect(hit).toBeNull();
  });

  it("honors explicit current-scene hit testing before a runtime frame is published", () => {
    const element = createHostElement();
    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointermove", {
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
      forceCurrentScene: true,
      getRetainedRuntimeFrame: () => null,
      getScene: () => retainedContentScene(),
      store: createGpuFlowViewportStore(),
    });

    expect(hit).toMatchObject({
      hit: {
        id: "row:param-1",
        kind: "row",
        ownerRowId: "param-1",
      },
      localPoint: { x: 116, y: 42 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("hit tests the current retained scene after a runtime frame has been published", () => {
    const element = createHostElement();
    const scene = retainedContentScene();
    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointermove", {
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
      getRetainedRuntimeFrame: () =>
        createGpuRetainedRuntimeFrame({
          devicePixelRatioBucket: 1,
          frameId: 1,
          scene,
          scrollOffsets: new Map(),
          scrollRevision: 1,
          viewport: [0, 0, 1],
          viewportZoomBucket: 1,
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
      localPoint: { x: 116, y: 42 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("hit tests retained content through the visible projection sample", () => {
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
    const projectionSample = {
      cssViewport: { height: 120, width: 240 },
      devicePixelRatio: 1,
      gestureOwner: "ownedByRetainedSectionScroll" as const,
      id: 7,
      retainedScrollDelta: new Map([
        ["dict-a:param-content:unpinned", { x: 0, y: 28 }],
      ]),
      retainedScrollOffsets: new Map([
        ["dict-a:param-content:unpinned", { x: 0, y: 28 }],
      ]),
      retainedScrollRevision: 1,
      retainedScrollVelocityCssPxPerMs: new Map([
        ["dict-a:param-content:unpinned", { x: 0, y: 0 }],
      ]),
      timestamp: 7,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportDelta: { x: 0, y: 0, zoom: 0 },
      viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
    };
    const visibleProjectionState = createGpuFlowVisibleProjectionState({
      committedFrame,
      transaction: createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: committedFrame.displayFrameId,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll"],
        sample: projectionSample,
      }),
    });

    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointermove", {
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
      getRetainedRuntimeFrame: () => retainedRuntimeFrame,
      getScene: () => retainedContentScene(),
      getVisibleProjectionState: () => visibleProjectionState,
      store: createGpuFlowViewportStore(),
    });

    expect(hit).toMatchObject({
      hit: {
        id: "row:param-2",
        kind: "row",
        ownerRowId: "param-2",
      },
      localPoint: { x: 116, y: 42 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("uses the current retained scene when the runtime frame has not caught up", () => {
    const element = createHostElement();
    const scene = retainedContentScene();
    const staleRetainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene: undefined,
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });

    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
      getRetainedRuntimeFrame: () => staleRetainedRuntimeFrame,
      getScene: () => scene,
      getScrollOffsets: () => new Map(),
      store: createGpuFlowViewportStore(),
    });

    expect(hit).toMatchObject({
      hit: {
        id: "control:param-0",
        kind: "control",
        ownerRowId: "param-0",
      },
      localPoint: { x: 140, y: 14 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("uses the current retained scene when the visible projection frame is stale", () => {
    const element = createHostElement();
    const staleScene = retainedContentScene();
    const currentScene = retainedContentScene(
      retainedSurface({ scrollOffset: { x: 0, y: 28 } }),
    );
    const staleRetainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene: staleScene,
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });
    const committedFrame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: staleRetainedRuntimeFrame,
    });
    const visibleProjectionState = createGpuFlowVisibleProjectionState({
      committedFrame,
      transaction: createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: committedFrame.displayFrameId,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll"],
        sample: {
          cssViewport: { height: 120, width: 240 },
          devicePixelRatio: 1,
          gestureOwner: "idle",
          id: 8,
          retainedScrollDelta: new Map(),
          retainedScrollOffsets: new Map(),
          retainedScrollRevision: 0,
          retainedScrollVelocityCssPxPerMs: new Map(),
          timestamp: 8,
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportDelta: { x: 0, y: 0, zoom: 0 },
          viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
        },
      }),
    });

    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
      getRetainedRuntimeFrame: () => null,
      getScene: () => currentScene,
      getVisibleProjectionState: () => visibleProjectionState,
      store: createGpuFlowViewportStore(),
    });

    expect(hit).toMatchObject({
      hit: {
        id: "control:param-1",
        kind: "control",
        ownerRowId: "param-1",
      },
      localPoint: { x: 140, y: 14 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("uses the current viewport while the startup frame is unpublished", () => {
    const element = createHostElement();
    const scene = retainedContentScene();
    const startupRetainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 0,
      scene,
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });
    const committedFrame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: startupRetainedRuntimeFrame,
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
          id: 9,
          retainedScrollDelta: new Map(),
          retainedScrollOffsets: new Map(),
          retainedScrollRevision: 0,
          retainedScrollVelocityCssPxPerMs: new Map(),
          timestamp: 9,
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportDelta: { x: 0, y: 0, zoom: 0 },
          viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
        },
      }),
    });

    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointerdown", {
        clientX: 140,
        clientY: 14,
        pointerId: 1,
      }),
      getRetainedRuntimeFrame: () => startupRetainedRuntimeFrame,
      getScene: () => scene,
      getVisibleProjectionState: () => visibleProjectionState,
      store: createGpuFlowViewportStore({ transform: [0, -28, 1] }),
    });

    expect(hit).toMatchObject({
      hit: {
        id: "control:param-1",
        kind: "control",
        ownerRowId: "param-1",
      },
      localPoint: { x: 140, y: 42 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("uses the current viewport before projection starts", () => {
    const element = createHostElement();
    const scene = retainedContentScene();
    const retainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene,
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [0, 0, 1],
      viewportZoomBucket: 0.5,
    });

    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointerdown", {
        clientX: 80,
        clientY: 12,
        pointerId: 1,
      }),
      getRetainedRuntimeFrame: () => retainedRuntimeFrame,
      getScene: () => scene,
      store: createGpuFlowViewportStore({ transform: [10, 5, 0.5] }),
    });

    expect(hit).toMatchObject({
      hit: {
        id: "control:param-0",
        kind: "control",
        ownerRowId: "param-0",
      },
      localPoint: { x: 140, y: 14 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("uses current retained scroll offsets when the visible projection sample is stale", () => {
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
    const staleProjectionSample = {
      cssViewport: { height: 120, width: 240 },
      devicePixelRatio: 1,
      gestureOwner: "ownedByRetainedSectionScroll" as const,
      id: 7,
      retainedScrollDelta: new Map([
        ["dict-a:param-content:unpinned", { x: 0, y: 28 }],
      ]),
      retainedScrollOffsets: new Map([
        ["dict-a:param-content:unpinned", { x: 0, y: 28 }],
      ]),
      retainedScrollRevision: 1,
      retainedScrollVelocityCssPxPerMs: new Map([
        ["dict-a:param-content:unpinned", { x: 0, y: 0 }],
      ]),
      timestamp: 7,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportDelta: { x: 0, y: 0, zoom: 0 },
      viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
    };
    const visibleProjectionState = createGpuFlowVisibleProjectionState({
      committedFrame,
      transaction: createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: committedFrame.displayFrameId,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll"],
        sample: staleProjectionSample,
      }),
    });

    const hit = hitTestGpuRetainedContentInteraction({
      element,
      event: createPointerEvent("pointermove", {
        clientX: 116,
        clientY: 42,
        pointerId: 1,
      }),
      getScene: () => scene,
      getScrollOffsets: () =>
        new Map([["dict-a:param-content:unpinned", { x: 0, y: 56 }]]),
      getVisibleProjectionState: () => visibleProjectionState,
      store: createGpuFlowViewportStore(),
    });

    expect(hit).toMatchObject({
      hit: {
        id: "row:param-3",
        kind: "row",
        ownerRowId: "param-3",
      },
      localPoint: { x: 116, y: 42 },
      surfaceId: "dict-a:param-content:unpinned",
    });
  });
});
