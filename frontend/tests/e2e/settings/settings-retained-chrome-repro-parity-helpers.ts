import { expect, type Page } from "@playwright/test";

import { readGpuFlowPerformanceSnapshot } from "../gpuFlowPerformanceProbe";
import {
  SETTINGS_PARAM_CONTENT_SUFFIX,
  type RetainedCompositorViewportSample,
} from "./settings-retained-compositor-helpers";
import { waitForAnimationFrame } from "./settings-retained-frame-helpers";
import {
  analyzeHorizontalPlaceholderBands,
  analyzeRetainedLabelTextInkBounds,
  type Rect,
} from "./settings-retained-visual-analysis";

export const SECTION_SIZING_SURFACE_ID =
  "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX;
export const MIN_RETAINED_CONTENT_NONBLANK_RATIO = 0.02;

const MIN_CHROME_REPRO_PARITY_LABEL_INK_PIXELS = 80;

export async function setRetainedCompositorViewport(
  page: Page,
  viewport: RetainedCompositorViewportSample,
): Promise<void> {
  await page.evaluate((nextViewport) => {
    const setViewport = window.__SETTA_GPU_FLOW_DEBUG_SET_VIEWPORT__;
    if (!setViewport) {
      throw new Error("Missing retained compositor viewport setter.");
    }
    setViewport(nextViewport);
    window.__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__?.("viewport");
    window.settaGpuFlowZoom = nextViewport.zoom;
  }, viewport);
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
  await waitForRetainedCompositorViewportCommit(page, viewport);
}

export function requireRetainedCompositorViewportSample(
  value: unknown,
): RetainedCompositorViewportSample {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { readonly x?: unknown }).x !== "number" ||
    typeof (value as { readonly y?: unknown }).y !== "number" ||
    typeof (value as { readonly zoom?: unknown }).zoom !== "number"
  ) {
    throw new Error("Missing retained compositor viewport sample.");
  }
  return value as RetainedCompositorViewportSample;
}

export async function captureRetainedCompositorVisibleClipScreenshot({
  clip,
  page,
  path,
}: {
  readonly clip: Rect;
  readonly page: Page;
  readonly path: string;
}): Promise<Buffer> {
  const deadlineMs = Date.now() + 10_000;
  let lastReadiness: RetainedCompositorClipReadiness | null = null;
  while (Date.now() < deadlineMs) {
    const screenshot = await page.screenshot({ clip, path });
    lastReadiness = await readRetainedCompositorClipReadiness({
      clip,
      page,
      screenshot,
    });
    if (isRetainedCompositorClipReady(lastReadiness)) {
      return screenshot;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(
    `Retained compositor clip did not become visible: ${JSON.stringify(
      lastReadiness,
      null,
      2,
    )}`,
  );
}

export async function waitForRetainedCompositorContentPublicationSettle(
  page: Page,
  sampleStartTimeMs: number,
): Promise<void> {
  await expect
    .poll(
      () =>
        readRetainedCompositorContentPublicationSettleState(
          page,
          sampleStartTimeMs,
        ),
      {
        intervals: [50, 80, 120, 180],
        timeout: 10_000,
      },
    )
    .toMatchObject({
      hasSettledContentPublication: true,
    });
}

async function waitForRetainedCompositorViewportCommit(
  page: Page,
  viewport: RetainedCompositorViewportSample,
): Promise<void> {
  await expect
    .poll(() => readRetainedCompositorViewportCommitState(page, viewport), {
      intervals: [50, 80, 120, 180],
      timeout: 10_000,
    })
    .toMatchObject({
      committedMatches: true,
      runtimeMatches: true,
    });
}

async function readRetainedCompositorViewportCommitState(
  page: Page,
  viewport: RetainedCompositorViewportSample,
) {
  return await page.evaluate((expected) => {
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
    const runtime = snapshot?.viewport.transform ?? null;
    const committed = snapshot?.committedSurfaceFrame?.viewportSample ?? null;
    return {
      committed,
      committedMatches: viewportMatches(committed, expected),
      expected,
      runtime,
      runtimeMatches: viewportMatches(runtime, expected),
    };

    function viewportMatches(
      actual:
        | { readonly x: number; readonly y: number; readonly zoom: number }
        | null
        | undefined,
      target: {
        readonly x: number;
        readonly y: number;
        readonly zoom: number;
      },
    ): boolean {
      return (
        actual !== null &&
        actual !== undefined &&
        closeEnough(actual.x, target.x) &&
        closeEnough(actual.y, target.y) &&
        closeEnough(actual.zoom, target.zoom)
      );
    }

    function closeEnough(actual: number, expectedValue: number): boolean {
      return Math.abs(actual - expectedValue) <= 0.5;
    }
  }, viewport);
}

type RetainedCompositorClipReadiness = {
  readonly highConfidencePlaceholder: boolean;
  readonly labelInkPixelCount: number;
  readonly nonblankRatio: number;
};

async function readRetainedCompositorClipReadiness({
  clip,
  page,
  screenshot,
}: {
  readonly clip: Rect;
  readonly page: Page;
  readonly screenshot: Buffer;
}): Promise<RetainedCompositorClipReadiness> {
  const placeholderStats = await analyzeHorizontalPlaceholderBands(page, {
    screenshot,
  });
  const labelInk = await analyzeRetainedLabelTextInkBounds(page, {
    clip,
    screenshot,
    searchRect: {
      height: clip.height,
      width: Math.min(260, clip.width * 0.5),
      x: clip.x,
      y: clip.y,
    },
  });
  return {
    highConfidencePlaceholder: placeholderStats.highConfidencePlaceholder,
    labelInkPixelCount: labelInk?.pixelCount ?? 0,
    nonblankRatio: placeholderStats.nonblankRatio,
  };
}

function isRetainedCompositorClipReady(
  readiness: RetainedCompositorClipReadiness,
): boolean {
  return (
    readiness.nonblankRatio > MIN_RETAINED_CONTENT_NONBLANK_RATIO &&
    !readiness.highConfidencePlaceholder &&
    readiness.labelInkPixelCount >= MIN_CHROME_REPRO_PARITY_LABEL_INK_PIXELS
  );
}

async function readRetainedCompositorContentPublicationSettleState(
  page: Page,
  sampleStartTimeMs: number,
) {
  const snapshot = await readGpuFlowPerformanceSnapshot(page);
  const surfaceFrameCompletions = snapshot.performanceMeasures
    .filter((measure) => measure.startTimeMs >= sampleStartTimeMs)
    .map((measure) => measure.detail)
    .filter(isRetainedSurfaceFrameCompletionDetail);
  const settledContentPublications = surfaceFrameCompletions.filter(
    isSettledRetainedContentPublicationCompletion,
  );
  return {
    hasSettledContentPublication: settledContentPublications.length > 0,
    latestCompletion:
      surfaceFrameCompletions[surfaceFrameCompletions.length - 1] ?? null,
    settledContentPublicationCount: settledContentPublications.length,
  };
}

type RetainedSurfaceFrameCompletionDetail = {
  readonly contentBlocked?: boolean | undefined;
  readonly contentCommittedSurfacePublished?: boolean | undefined;
  readonly contentDebt?: boolean | undefined;
  readonly contentRendered?: boolean | undefined;
  readonly frame?: number | undefined;
  readonly lane?: string | undefined;
  readonly maintenanceDebt?: boolean | undefined;
  readonly motionDebt?: boolean | undefined;
  readonly phase: "surface-frame-completion";
  readonly reasons?: string | undefined;
};

function isRetainedSurfaceFrameCompletionDetail(
  value: unknown,
): value is RetainedSurfaceFrameCompletionDetail {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { readonly phase?: unknown }).phase ===
      "surface-frame-completion"
  );
}

function isSettledRetainedContentPublicationCompletion(
  detail: RetainedSurfaceFrameCompletionDetail,
): boolean {
  return (
    detail.lane === "content" &&
    detail.contentRendered === true &&
    detail.contentCommittedSurfacePublished === true &&
    detail.contentBlocked === false
  );
}
