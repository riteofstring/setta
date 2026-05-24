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

const MAX_EXPECTED_MOUNTED_DOM_CONTROLS = 32;

test("presented content frame debug snapshot keeps passive DOM actor scale bounded", async ({
  page,
}) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  await resolveRetainedCompositorTarget(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  await waitForAnimationFrame(page);

  await expect
    .poll(() => readPresentedContentFrameDomActorSampleReady(page), {
      timeout: 5_000,
    })
    .toBe(true);
  const sample = await readPresentedContentFrameDomActorSample(page);

  const details = JSON.stringify(sample, null, 2);
  expect(sample.presentedContentFrame, details).not.toBeNull();
  expect(
    sample.diagnostics?.mountedControlCount ?? 0,
    details,
  ).toBeLessThanOrEqual(MAX_EXPECTED_MOUNTED_DOM_CONTROLS);
  expect(sample.diagnostics?.mountedControlCount ?? 0, details).toBeLessThan(
    sample.presentedContentFrame?.domControlActorCount ?? 0,
  );
  const domControlPlaneVisible =
    (sample.diagnostics?.visibleControlRectCount ?? 0) > 0;
  if (domControlPlaneVisible) {
    expect(Number.isFinite(sample.planePreparedContentFrameId), details).toBe(
      true,
    );
    expect(Number.isFinite(sample.planeRuntimeFrameId), details).toBe(true);
    expect(sample.canvasProjectionTransactionId, details).toBeTruthy();
    expect(sample.planeProjectionTransactionId, details).toBe(
      sample.canvasProjectionTransactionId,
    );
    expect(sample.planeProjectionSampleId, details).toBe(
      sample.canvasProjectionSampleId,
    );
    expect(sample.planeProjectionPreparedContentFrameId, details).toBe(
      sample.canvasProjectionPreparedContentFrameId,
    );
    expect(sample.planeProjectionPreparedContentFrameId, details).toBe(
      sample.presentedContentFrame?.displayFrameId,
    );
  }
  expect(sample.presentedContentFrame?.debugSnapshotFrameId, details).toBe(
    sample.presentedContentFrame?.displayFrameId,
  );
  expect(sample.presentedContentFrame?.displayCompletenessStatus, details).toBe(
    "complete",
  );
  expect(sample.presentedContentFrame?.publishabilityKind, details).toBe(
    "publishable",
  );
  expect(
    sample.presentedContentFrame?.publishabilityReason,
    details,
  ).toBeNull();
  expect(
    sample.presentedContentFrame?.projectionHorizon.textActorTrueHoleCount,
    details,
  ).toBe(0);
  expect(
    sample.presentedContentFrame?.projectionHorizon
      .textActorExactCoverageCount ?? 0,
    details,
  ).toBeGreaterThan(8);
  expect(
    sample.presentedContentFrame?.domControlActorCount ?? 0,
    details,
  ).toBeGreaterThan(8);
  expect(
    sample.presentedContentFrame?.projectedVisibleNonemptyDomControlCount,
    details,
  ).toBe(sample.presentedContentFrame?.visibleNonemptyDomControlCount);
  expect(
    sample.presentedContentFrame?.retainedScrollRevision,
    details,
  ).toBeGreaterThan(0);
});

type PresentedContentFrameDomActorSample = Awaited<
  ReturnType<typeof readPresentedContentFrameDomActorSample>
>;

async function readPresentedContentFrameDomActorSample(page: Page): Promise<{
  readonly presentedContentFrame: NonNullable<
    ReturnType<
      NonNullable<Window["__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__"]>
    >["presentedContentFrame"]
  > | null;
  readonly diagnostics: {
    readonly preparedContentFrameId: number;
    readonly mountedControlCount: number;
    readonly runtimeFrameId: number;
    readonly visibleControlRectCount: number;
  } | null;
  readonly planePreparedContentFrameId: number;
  readonly planeProjectionPreparedContentFrameId: number;
  readonly planeProjectionSampleId: number;
  readonly planeProjectionTransactionId: string | null;
  readonly planeRuntimeFrameId: number;
  readonly canvasProjectionPreparedContentFrameId: number;
  readonly canvasProjectionSampleId: number;
  readonly canvasProjectionTransactionId: string | null;
}> {
  return await page.evaluate(() => {
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
    const presentedContentFrame = snapshot?.presentedContentFrame ?? null;
    const diagnostics =
      (
        window as typeof window & {
          __settaGpuFlowDomControlPlaneDiagnostics?: () => {
            readonly preparedContentFrameId: number;
            readonly mountedControlCount: number;
            readonly runtimeFrameId: number;
            readonly visibleControlRectCount: number;
          };
        }
      ).__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null;
    const plane = document.querySelector<HTMLElement>(
      "[data-gpu-flow-dom-control-plane='true']",
    );
    const canvas = document.querySelector<HTMLElement>(
      "[data-gpu-flow-surface='true']",
    );
    return {
      presentedContentFrame,
      diagnostics,
      canvasProjectionPreparedContentFrameId: Number(
        canvas?.dataset.gpuFlowPreparedContentFrameId ?? NaN,
      ),
      canvasProjectionSampleId: Number(
        canvas?.dataset.gpuFlowProjectionSampleId ?? NaN,
      ),
      canvasProjectionTransactionId:
        canvas?.dataset.gpuFlowProjectionTransactionId ?? null,
      planePreparedContentFrameId: Number(
        plane?.dataset.gpuFlowDomControlPlanePreparedContentFrameId ?? NaN,
      ),
      planeProjectionPreparedContentFrameId: Number(
        plane?.dataset.gpuFlowPreparedContentFrameId ?? NaN,
      ),
      planeProjectionSampleId: Number(
        plane?.dataset.gpuFlowProjectionSampleId ?? NaN,
      ),
      planeProjectionTransactionId:
        plane?.dataset.gpuFlowProjectionTransactionId ?? null,
      planeRuntimeFrameId: Number(
        plane?.dataset.gpuFlowDomControlPlaneFrameId ?? NaN,
      ),
    };
  });
}

async function readPresentedContentFrameDomActorSampleReady(
  page: Page,
): Promise<boolean> {
  return isPresentedContentFrameDomActorSampleReady(
    await readPresentedContentFrameDomActorSample(page),
  );
}

function isPresentedContentFrameDomActorSampleReady(
  sample: PresentedContentFrameDomActorSample,
): boolean {
  return Boolean(
    sample.presentedContentFrame &&
      sample.diagnostics &&
      sample.presentedContentFrame.displayCompletenessStatus === "complete" &&
      sample.presentedContentFrame.publishabilityKind === "publishable" &&
      sample.canvasProjectionTransactionId &&
      sample.planeProjectionTransactionId &&
      sample.diagnostics.mountedControlCount <=
        MAX_EXPECTED_MOUNTED_DOM_CONTROLS,
  );
}

test("viewport wheel-pan burst continues after the pointer moves over passive browser text", async ({
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
