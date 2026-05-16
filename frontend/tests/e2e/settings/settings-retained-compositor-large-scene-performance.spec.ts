import { expect, test } from "@playwright/test";

import {
  SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  captureRetainedCompositorVisualStats,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  expectRetainedCompositorGestureWithinBudget,
  measureRetainedCompositorControlCadence,
  measureRetainedCompositorGesture,
  openAllSettingsForRetainedCompositor,
  readNativePageScrollY,
  readRetainedCompositorSceneSummary,
  readRetainedCompositorScrollSignature,
  readRetainedCompositorViewport,
  recordRetainedCompositorPerfSample,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  resolveRetainedCompositorViewportPoint,
  runNativeRetainedCompositorWheelBurst,
  waitForRetainedCompositorGestureIdle,
} from "./settings-retained-compositor-helpers";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("all-settings retained compositor gestures stay within the measured cadence cap", async ({
  page,
}) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const scene = await readRetainedCompositorSceneSummary(page);
  const target = await resolveRetainedCompositorTarget(page);
  const viewportPoint = await resolveRetainedCompositorViewportPoint(page);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const beforeViewport = await readRetainedCompositorViewport(page);
  const beforeScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  const beforePageScrollY = await readNativePageScrollY(page);
  const beforeVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );

  await waitForRetainedCompositorGestureIdle(page);
  const pan = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      deltaY: 1,
      eventCount: 96,
      point: viewportPoint,
    }),
  );
  const afterPanViewport = await readRetainedCompositorViewport(page);
  await waitForRetainedCompositorGestureIdle(page);
  const zoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: viewportPoint,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  const retainedHoverZoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: target.point,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  const retainedScroll = await measureRetainedCompositorGesture(page, () =>
    runNativeRetainedCompositorWheelBurst(page, {
      deltaY: 44,
      eventCount: 18,
      point: target.point,
    }),
  );
  const afterScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  await waitForRetainedCompositorGestureIdle(page);
  const scrollThenRetainedHoverZoom = await measureRetainedCompositorGesture(
    page,
    async () => {
      const scrollSpacing = await runNativeRetainedCompositorWheelBurst(page, {
        deltaY: 36,
        eventCount: 10,
        point: target.point,
      });
      const zoomSpacing = await dispatchRetainedCompositorWheelBurst(page, {
        ctrlKey: true,
        deltaY: -0.25,
        eventCount: 48,
        point: target.point,
      });
      return [...scrollSpacing, ...zoomSpacing];
    },
  );
  const afterViewport = await readRetainedCompositorViewport(page);
  const afterPageScrollY = await readNativePageScrollY(page);
  const afterVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );
  const gestures = {
    pan,
    retainedHoverZoom,
    retainedScroll,
    scrollThenRetainedHoverZoom,
    zoom,
  };
  const budgets = {
    pan: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: pan.eventSpacing,
    }),
    retainedHoverZoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: retainedHoverZoom.eventSpacing,
    }),
    retainedScroll: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: retainedScroll.eventSpacing,
    }),
    scrollThenRetainedHoverZoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: scrollThenRetainedHoverZoom.eventSpacing,
    }),
    zoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: zoom.eventSpacing,
    }),
  };
  const details = JSON.stringify(
    {
      budgets,
      controlCadence,
      gestures,
      pageScroll: { after: afterPageScrollY, before: beforePageScrollY },
      scene,
      scrollSignatures: {
        afterScroll: afterScrollSignature,
        before: beforeScrollSignature,
      },
      surface: target,
      viewport: {
        after: afterViewport,
        afterPan: afterPanViewport,
        before: beforeViewport,
      },
      viewportPoint,
      visual: { after: afterVisual, before: beforeVisual },
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "all-settings retained compositor large scene",
    sample: JSON.parse(details),
  });

  expect(scene.nodeCount, details).toBeGreaterThan(30);
  expect(scene.retainedRowCount, details).toBeGreaterThan(100);
  expect(scene.surfaceCount, details).toBeGreaterThan(4);
  expect(scene.controlKinds.length, details).toBeGreaterThan(4);
  expect(
    Math.abs(afterPanViewport.y - beforeViewport.y),
    details,
  ).toBeGreaterThan(8);
  expect(afterViewport.zoom, details).not.toBeCloseTo(beforeViewport.zoom, 3);
  expect(afterScrollSignature, details).not.toEqual(beforeScrollSignature);
  expect(afterPageScrollY, details).toBe(beforePageScrollY);
  expect(beforeVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(retainedHoverZoom.frame.p95Ms, details).toBeLessThanOrEqual(
    Math.max(budgets.retainedHoverZoom.p95FrameBudgetMs, zoom.frame.p95Ms + 8),
  );
  await test.step(
    "large complex scene panning stays within the interaction frame budget",
    async () => {
      expectRetainedCompositorGestureWithinBudget({
        budget: budgets.pan,
        details,
        gesture: pan,
      });
    },
  );
  await test.step(
    "large complex scene zooming stays within the interaction frame budget",
    async () => {
      expectRetainedCompositorGestureWithinBudget({
        budget: budgets.zoom,
        details,
        gesture: zoom,
      });
      expectRetainedCompositorGestureWithinBudget({
        budget: budgets.retainedHoverZoom,
        details,
        gesture: retainedHoverZoom,
      });
    },
  );
  await test.step(
    "large complex retained section scrolling stays within the interaction frame budget",
    async () => {
      expectRetainedCompositorGestureWithinBudget({
        budget: budgets.retainedScroll,
        details,
        gesture: retainedScroll,
      });
    },
  );
  expectRetainedCompositorGestureWithinBudget({
    budget: budgets.scrollThenRetainedHoverZoom,
    details,
    gesture: scrollThenRetainedHoverZoom,
  });
});
