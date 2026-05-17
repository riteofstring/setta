import { expect, test, type Page } from "@playwright/test";

import {
  SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  centerRetainedCompositorSurface,
  openAllSettingsForRetainedCompositor,
  readRetainedCompositorViewport,
  resolveRetainedCompositorTarget,
  resolveRetainedCompositorViewportPoint,
  type RetainedCompositorPoint,
} from "./settings-retained-compositor-helpers";
import { waitForAnimationFrame } from "./settings-retained-frame-helpers";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("committed surface debug snapshot keeps passive DOM actor scale bounded", async ({
  page,
}) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  await resolveRetainedCompositorTarget(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  await waitForAnimationFrame(page);

  const sample = await page.evaluate(() => {
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
    const committed = snapshot?.committedSurfaceFrame ?? null;
    const diagnostics =
      (
        window as typeof window & {
          __settaGpuFlowDomControlPlaneDiagnostics?: () => {
            readonly committedFrameId: number;
            readonly mountedControlCount: number;
            readonly runtimeFrameId: number;
            readonly visibleControlRectCount: number;
          };
        }
      ).__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null;
    const plane = document.querySelector<HTMLElement>(
      "[data-gpu-flow-dom-control-plane='true']",
    );
    return {
      committed,
      diagnostics,
      planeCommittedFrameId: Number(
        plane?.dataset.gpuFlowDomControlPlaneCommittedFrameId ?? NaN,
      ),
      planeRuntimeFrameId: Number(
        plane?.dataset.gpuFlowDomControlPlaneFrameId ?? NaN,
      ),
    };
  });

  const details = JSON.stringify(sample, null, 2);
  expect(sample.committed, details).not.toBeNull();
  expect(
    sample.diagnostics?.mountedControlCount ?? 0,
    details,
  ).toBeLessThanOrEqual(8);
  expect(
    sample.diagnostics?.visibleControlRectCount ?? 0,
    details,
  ).toBeLessThanOrEqual(8);
  const domControlPlaneActive =
    (sample.committed?.domControlActorCount ?? 0) > 0 ||
    (sample.diagnostics?.mountedControlCount ?? 0) > 0 ||
    (sample.diagnostics?.visibleControlRectCount ?? 0) > 0;
  if (domControlPlaneActive) {
    expect(sample.planeCommittedFrameId, details).toBe(
      sample.committed?.domControlCommittedFrameId,
    );
    expect(sample.diagnostics?.committedFrameId, details).toBe(
      sample.committed?.domControlCommittedFrameId,
    );
    expect(sample.planeRuntimeFrameId, details).toBe(
      sample.committed?.canvasRetainedFrameId,
    );
  }
  expect(sample.committed?.debugSnapshotFrameId, details).toBe(
    sample.committed?.displayFrameId,
  );
  expect(sample.committed?.displayCompletenessStatus, details).toBe("complete");
  expect(
    sample.committed?.domControlActorCount ?? 0,
    details,
  ).toBeLessThanOrEqual(8);
  expect(
    sample.committed?.projectedVisibleNonemptyDomControlCount,
    details,
  ).toBe(sample.committed?.visibleNonemptyDomControlCount);
  expect(sample.committed?.retainedScrollRevision, details).toBeGreaterThan(0);
});

test("viewport wheel-pan burst continues after the pointer moves over passive canvas text", async ({
  page,
}) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  await resolveRetainedCompositorTarget(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const start = await resolveRetainedCompositorViewportPoint(page);
  const controlPoint = await resolvePassiveTextLikeControlPoint(page);
  const before = await readRetainedCompositorViewport(page);

  await dispatchWheelSequence(page, [start, controlPoint, controlPoint]);
  await waitForAnimationFrame(page);
  const after = await readRetainedCompositorViewport(page);

  const details = JSON.stringify(
    { after, before, controlPoint, start },
    null,
    2,
  );
  expect(after.y, details).toBeLessThan(before.y - 40);
  expect(Math.abs(after.x - before.x), details).toBeLessThan(4);
});

async function resolvePassiveTextLikeControlPoint(
  page: Page,
): Promise<RetainedCompositorPoint> {
  return await page.evaluate(() => {
    const row = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).find(
      (candidate) =>
        candidate.controlKind === "text-like" &&
        candidate.controlClientRect &&
        candidate.controlClientRect.width > 20 &&
        candidate.controlClientRect.height > 8 &&
        candidate.controlClientRect.x > 0 &&
        candidate.controlClientRect.y > 0 &&
        candidate.controlClientRect.x + candidate.controlClientRect.width <
          window.innerWidth &&
        candidate.controlClientRect.y + candidate.controlClientRect.height <
          window.innerHeight,
    );
    if (!row?.controlClientRect) {
      throw new Error("Missing visible passive text-like retained row.");
    }
    const rect = row.controlClientRect;
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  });
}

async function dispatchWheelSequence(
  page: Page,
  points: readonly RetainedCompositorPoint[],
): Promise<void> {
  await page.evaluate(
    async (input) => {
      for (const point of input.points) {
        const target = document.elementFromPoint(point.x, point.y);
        if (!target) {
          throw new Error(
            `Missing wheel target at ${point.x.toFixed(1)}, ${point.y.toFixed(
              1,
            )}.`,
          );
        }
        target.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            deltaMode: WheelEvent.DOM_DELTA_PIXEL,
            deltaY: 48,
            view: window,
          }),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 8));
      }
    },
    { points },
  );
}
