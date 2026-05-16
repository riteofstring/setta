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
  readRetainedCompositorScrollSignature,
  readRetainedCompositorViewport,
  recordRetainedCompositorPerfSample,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  resolveRetainedCompositorViewportPoint,
  runNativeRetainedCompositorWheelBurst,
} from "./settings-retained-compositor-helpers";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained-hover zoom sustains the same compositor cadence class as viewport zoom", async ({
  page,
}) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  const target = await resolveRetainedCompositorTarget(page);
  const viewportPoint = await resolveRetainedCompositorViewportPoint(page);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const beforeViewport = await readRetainedCompositorViewport(page);
  const beforeVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );

  const viewportZoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: viewportPoint,
    }),
  );
  const retainedHoverZoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: target.point,
    }),
  );
  const afterViewport = await readRetainedCompositorViewport(page);
  const afterVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );
  const viewportZoomBudget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: viewportZoom.eventSpacing,
  });
  const retainedHoverZoomBudget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: retainedHoverZoom.eventSpacing,
  });
  const details = JSON.stringify(
    {
      budgets: { retainedHoverZoomBudget, viewportZoomBudget },
      controlCadence,
      retainedHoverZoom,
      surface: target,
      viewport: { after: afterViewport, before: beforeViewport },
      viewportPoint,
      viewportZoom,
      visual: { after: afterVisual, before: beforeVisual },
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "retained-hover zoom cadence",
    sample: JSON.parse(details),
  });

  expect(afterViewport.zoom, details).not.toBeCloseTo(beforeViewport.zoom, 3);
  expect(beforeVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(target.visibleRowCount, details).toBeGreaterThan(3);
  expectRetainedCompositorGestureWithinBudget({
    budget: viewportZoomBudget,
    details,
    gesture: viewportZoom,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: retainedHoverZoomBudget,
    details,
    gesture: retainedHoverZoom,
  });
  expect(retainedHoverZoom.frame.p95Ms, details).toBeLessThanOrEqual(
    Math.max(
      retainedHoverZoomBudget.p95FrameBudgetMs,
      viewportZoom.frame.p95Ms + 8,
    ),
  );
});

test("retained section scroll and immediate retained-hover zoom preserve scroll ownership and content", async ({
  page,
}) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  const target = await resolveRetainedCompositorTarget(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const beforeScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  const beforeViewport = await readRetainedCompositorViewport(page);
  const beforePageScrollY = await readNativePageScrollY(page);
  const beforeVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );

  const scrollGesture = await measureRetainedCompositorGesture(page, () =>
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
  const afterScrollVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );
  const scrollThenZoom = await measureRetainedCompositorGesture(
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
  const scrollBudget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: scrollGesture.eventSpacing,
  });
  const scrollThenZoomBudget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: scrollThenZoom.eventSpacing,
  });
  const details = JSON.stringify(
    {
      budgets: { scrollBudget, scrollThenZoomBudget },
      controlCadence,
      pageScroll: { after: afterPageScrollY, before: beforePageScrollY },
      scrollGesture,
      scrollSignatures: {
        afterScroll: afterScrollSignature,
        before: beforeScrollSignature,
      },
      scrollThenZoom,
      surface: target,
      viewport: { after: afterViewport, before: beforeViewport },
      visual: {
        after: afterVisual,
        afterScroll: afterScrollVisual,
        before: beforeVisual,
      },
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "retained section scroll then retained-hover zoom",
    sample: JSON.parse(details),
  });

  expect(afterScrollSignature, details).not.toEqual(beforeScrollSignature);
  expect(afterViewport.zoom, details).not.toBeCloseTo(beforeViewport.zoom, 3);
  expect(afterPageScrollY, details).toBe(beforePageScrollY);
  expect(beforeVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterScrollVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expectRetainedCompositorGestureWithinBudget({
    budget: scrollBudget,
    details,
    gesture: scrollGesture,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: scrollThenZoomBudget,
    details,
    gesture: scrollThenZoom,
  });
});
