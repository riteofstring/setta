import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { expect, type Page } from "@playwright/test";

import { ensureAppReady, postBackend } from "../helpers";
import {
  measurePageRafCadence,
  percentile,
  waitForAnimationFrame,
  type PageRafCadence,
} from "./settings-retained-frame-helpers";
import {
  startRetainedCompositorGestureFrameSampler,
  stopRetainedCompositorGestureFrameSampler,
  type RetainedCompositorFrameSample,
  type RetainedCompositorLongTaskSample,
} from "./settings-retained-frame-sampler";
import type {
  Rect,
  RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";
export {
  captureRetainedCompositorEvidenceScreenshot,
  startRetainedCompositorGestureFrameSampler,
  stopRetainedCompositorGestureFrameSampler,
} from "./settings-retained-frame-sampler";
export type {
  RetainedCompositorFrameSample,
  RetainedCompositorLongTaskAttribution,
  RetainedCompositorLongTaskSample,
} from "./settings-retained-frame-sampler";

export const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";
export const SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID = `settings-section__shortcuts${SETTINGS_PARAM_CONTENT_SUFFIX}`;

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GESTURE_SPACING_MS = 8;
const STRICT_P95_FRAME_BUDGET_MS = 8.5;
const STRICT_P99_FRAME_BUDGET_MS = 16.7;
const STRICT_BASELINE_P50_FRAME_BUDGET_MS = 8.5;
const STRICT_BASELINE_P95_FRAME_BUDGET_MS = 10;
const STRICT_GESTURE_EVENT_P95_BUDGET_MS = 9;
const STRICT_FRAME_TIMER_JITTER_EPSILON_MS = 0.5;
const CAPPED_P99_FRAME_BUDGET_MS = 60;
const CAPPED_MAX_FRAME_BUDGET_MS = 70;
const CAPPED_LONG_TASK_BUDGET_MS = 70;
const CAPPED_FRAME_TIMER_JITTER_EPSILON_MS = 1;
// The capped lane is selected only after the control RAF sample proves this
// browser/display path is not measuring a strict 120 Hz cadence. Duration
// budgets still guard visible stalls, but a slow-frame ratio is not meaningful
// when the browser or native event delivery is already externally capped.
export type RetainedCompositorPoint = {
  readonly x: number;
  readonly y: number;
};

export type RetainedCompositorIntervalStats = {
  readonly count: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly slowFrameRatio: number;
};

export type RetainedCompositorGestureResult = {
  readonly eventSpacing: RetainedCompositorIntervalStats;
  readonly frame: RetainedCompositorIntervalStats;
  readonly longTasks: {
    readonly count: number;
    readonly entries: readonly RetainedCompositorLongTaskSample[];
    readonly maxDurationMs: number;
  };
};

export type RetainedCompositorCadenceBudget = {
  readonly lane: "ci-capped" | "local-120hz" | "refresh-aware";
  readonly longTaskBudgetMs: number;
  readonly maxFrameBudgetMs: number;
  readonly p95FrameBudgetMs: number;
  readonly p99FrameBudgetMs: number;
  readonly slowFrameRatioBudget: number;
};

export type RetainedCompositorTarget = {
  readonly clip: Rect;
  readonly controlKinds: readonly string[];
  readonly point: RetainedCompositorPoint;
  readonly rowCount: number;
  readonly surfaceId: string;
  readonly visibleRowCount: number;
};

export type RetainedCompositorScrollSignature = {
  readonly firstRowId: string | null;
  readonly firstRowY: number | null;
  readonly lastRowId: string | null;
  readonly rowCount: number;
};

export type RetainedCompositorVisualStats = {
  readonly height: number;
  readonly nonblankRatio: number;
  readonly width: number;
};

export type RetainedCompositorViewportSample = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

export async function openAllSettingsForRetainedCompositor(
  page: Page,
): Promise<void> {
  await ensureAppReady(page);
  await postBackend(page, "/setActiveViewMode", {
    activeViewModeId: "settings-all",
    projectConfigId: "settings",
  });
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForAnimationFrame(page);
  await page.getByRole("button", { exact: true, name: "All Settings" }).click();
  await expect
    .poll(() => readRetainedCompositorRowCount(page), { timeout: 10_000 })
    .toBeGreaterThan(50);
  await waitForRetainedCompositorCoherentVisibleFrame(page);
  await waitForAnimationFrame(page);
}

export async function waitForRetainedCompositorCoherentVisibleFrame(
  page: Page,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  let latestDiagnostics: unknown = null;
  while (Date.now() < deadline) {
    latestDiagnostics =
      await readRetainedCompositorVisibleFrameDiagnostics(page);
    if (
      latestDiagnostics &&
      typeof latestDiagnostics === "object" &&
      (latestDiagnostics as { readonly coldStartShell?: unknown })
        .coldStartShell === null
    ) {
      return;
    }
    await page.waitForTimeout(120);
  }
  throw new Error(
    `Retained compositor cold-start shell did not clear. ${JSON.stringify(
      latestDiagnostics,
      null,
      2,
    )}`,
  );
}

async function readRetainedCompositorVisibleFrameDiagnostics(
  page: Page,
): Promise<unknown> {
  return await page.evaluate(() => {
    const coldStartShell = document.querySelector<HTMLElement>(
      '[data-gpu-flow-cold-start-shell="true"]',
    );
    const blockedEvents =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ ?? [];
    const domControlPlane = document.querySelector<HTMLElement>(
      '[data-gpu-flow-dom-control-plane="true"]',
    );
    const snapshotDiagnostics =
      (
        window as typeof window & {
          readonly __settaGpuFlowDomControlSnapshotSourceDiagnostics?: () => readonly {
            readonly expectedTextureContentKey: string;
            readonly inPreparation: boolean;
            readonly sourceId: string;
            readonly surfaceId: string;
            readonly texture: unknown;
          }[];
        }
      ).__settaGpuFlowDomControlSnapshotSourceDiagnostics?.() ?? [];
    const lastBlockedEvent = blockedEvents.at(-1) as
      | {
          readonly blockedReasons?: readonly {
            readonly actorId?: string | null;
          }[];
        }
      | null
      | undefined;
    const lastBlockedActorId =
      lastBlockedEvent?.blockedReasons?.find((reason) => reason.actorId)
        ?.actorId ?? null;
    const lastBlockedSnapshotSourceElement = lastBlockedActorId
      ? [
          ...document.querySelectorAll<HTMLElement>(
            '[data-gpu-flow-dom-control-snapshot-source="true"]',
          ),
        ].find(
          (element) =>
            element.dataset.gpuFlowDomControlId === lastBlockedActorId,
        ) ?? null
      : null;
    const browserVisualPreparationDiagnostics =
      (
        window as typeof window & {
          readonly __settaGpuFlowBrowserVisualPreparationDiagnostics?: (
            actorId?: string | null,
          ) => unknown;
        }
      ).__settaGpuFlowBrowserVisualPreparationDiagnostics?.(
        lastBlockedActorId,
      ) ?? null;
    const debugSnapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.() ?? null;
    if (!coldStartShell) {
      return {
        blockedEventCount: blockedEvents.length,
        coldStartShell: null,
        domControlCount: document.querySelectorAll(
          '[data-gpu-flow-dom-control="true"]',
        ).length,
        domControlPlaneCommittedFrameId:
          domControlPlane?.dataset.gpuFlowDomControlPlaneCommittedFrameId ??
          null,
        retainedRowCount:
          window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
        visiblePublication: debugSnapshot?.visiblePublication ?? null,
      };
    }
    return {
      blockedEventCount: blockedEvents.length,
      coldStartShell: {
        frameId: coldStartShell.dataset.gpuFlowColdStartShellFrameId ?? null,
        reason: coldStartShell.dataset.gpuFlowColdStartShellReason ?? null,
      },
      domControlCount: document.querySelectorAll(
        '[data-gpu-flow-dom-control="true"]',
      ).length,
      domControlPlaneCommittedFrameId:
        domControlPlane?.dataset.gpuFlowDomControlPlaneCommittedFrameId ?? null,
      domControlPlaneRuntimeFrameId:
        domControlPlane?.dataset.gpuFlowDomControlPlaneFrameId ?? null,
      lastBlockedEvent: lastBlockedEvent ?? null,
      lastBlockedSnapshotDiagnostic: lastBlockedActorId
        ? snapshotDiagnostics.find(
            (diagnostic) => diagnostic.sourceId === lastBlockedActorId,
          ) ?? null
        : null,
      lastBlockedSnapshotSourceElement: lastBlockedSnapshotSourceElement
        ? {
            connected: lastBlockedSnapshotSourceElement.isConnected,
            sourceId:
              lastBlockedSnapshotSourceElement.dataset.gpuFlowSourceId ?? null,
          }
        : null,
      lastBlockedBrowserVisualPreparation: browserVisualPreparationDiagnostics,
      preparationControlCount: document.querySelectorAll(
        '[data-gpu-flow-dom-control-preparation="true"]',
      ).length,
      retainedRowCount:
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
      snapshotContentCount: document.querySelectorAll(
        '[data-gpu-flow-retained-dom-control-snapshot-content="true"]',
      ).length,
      snapshotDiagnosticCount: snapshotDiagnostics.length,
      snapshotSourceCount: document.querySelectorAll(
        '[data-gpu-flow-dom-control-snapshot-source="true"]',
      ).length,
      visiblePublication: debugSnapshot?.visiblePublication ?? null,
    };
  });
}

export async function markGpuFlowRetainedSettingsFinishLineStart(
  page: Page,
): Promise<void> {
  await page.evaluate(async () => {
    const { postChromeReproFinishLineMarker } = await import(
      "/src/state/actions/chromeRepro.ts"
    );
    postChromeReproFinishLineMarker();
  });
}

export async function centerRetainedCompositorSurface(
  page: Page,
  surfaceId = SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
): Promise<void> {
  await page.evaluate(async (targetSurfaceId) => {
    const pane = document.querySelector<HTMLElement>(".setta-gpu-flow__pane");
    const transform =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
    const setViewport = window.__SETTA_GPU_FLOW_DEBUG_SET_VIEWPORT__;
    const rows = getRetainedRows().filter(
      (row) => row.surfaceId === targetSurfaceId,
    );
    const firstRow = rows[0];
    if (!pane || !transform || !setViewport || !firstRow) {
      throw new Error(`Missing retained surface ${targetSurfaceId}.`);
    }
    const paneRect = pane.getBoundingClientRect();
    const viewportFlowRect = firstRow.surfaceViewportFlowRect;
    const zoom = 1;
    const flowCenter = {
      x: viewportFlowRect.x + viewportFlowRect.width / 2,
      y: viewportFlowRect.y + viewportFlowRect.height / 2,
    };
    setViewport({
      x: paneRect.width * 0.5 - flowCenter.x * zoom,
      y: paneRect.height * 0.48 - flowCenter.y * zoom,
      zoom,
    });
    window.__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__?.("viewport");
    window.settaGpuFlowZoom = zoom;

    function getRetainedRows(): readonly RetainedRowDebugEntry[] {
      return window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    }
  }, surfaceId);
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

export async function resolveRetainedCompositorTarget(
  page: Page,
  surfaceId = SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
): Promise<RetainedCompositorTarget> {
  return await page.evaluate((targetSurfaceId) => {
    const rows = getRetainedRows().filter(
      (row) => row.surfaceId === targetSurfaceId,
    );
    const visibleRows = rows.filter((row) => {
      const rect = row.controlClientRect ?? row.clientRect;
      return isVisibleRect(rect);
    });
    const targetRow = visibleRows[Math.floor(visibleRows.length / 2)];
    if (!targetRow) {
      throw new Error(`Missing visible retained row for ${targetSurfaceId}.`);
    }
    const visibleRect = surfaceRowsToClientRect(visibleRows);
    return {
      clip: clampScreenshotClip({
        height: Math.min(visibleRect.height, 520),
        width: Math.min(visibleRect.width, 680),
        x: visibleRect.x,
        y: visibleRect.y,
      }),
      controlKinds: uniqueStrings(
        rows
          .map((row) => row.controlKind)
          .filter((kind): kind is string => Boolean(kind)),
      ),
      point: {
        x: targetRow.clientRect.x + targetRow.clientRect.width * 0.62,
        y: targetRow.clientRect.y + targetRow.clientRect.height / 2,
      },
      rowCount: rows.length,
      surfaceId: targetSurfaceId,
      visibleRowCount: visibleRows.length,
    };

    function getRetainedRows(): readonly RetainedRowDebugEntry[] {
      return window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    }

    function isVisibleRect(rect: Rect): boolean {
      return (
        rect.width > 20 &&
        rect.height > 8 &&
        rect.x + rect.width > 0 &&
        rect.y + rect.height > 0 &&
        rect.x < window.innerWidth &&
        rect.y < window.innerHeight
      );
    }

    function surfaceRowsToClientRect(
      surfaceRows: readonly RetainedRowDebugEntry[],
    ) {
      const left = Math.min(...surfaceRows.map((row) => row.clientRect.x));
      const top = Math.max(
        0,
        Math.min(...surfaceRows.map((row) => row.clientRect.y)),
      );
      const right = Math.min(
        window.innerWidth,
        Math.max(
          ...surfaceRows.map((row) => row.clientRect.x + row.clientRect.width),
        ),
      );
      const bottom = Math.min(
        window.innerHeight,
        Math.max(
          ...surfaceRows.map((row) => row.clientRect.y + row.clientRect.height),
        ),
      );
      return {
        height: Math.max(0, bottom - top),
        width: Math.max(0, right - left),
        x: left,
        y: top,
      };
    }

    function clampScreenshotClip(rect: Rect): Rect {
      const x = Math.max(0, Math.min(window.innerWidth - 1, rect.x));
      const y = Math.max(0, Math.min(window.innerHeight - 1, rect.y));
      return {
        height: Math.max(1, Math.min(rect.height, window.innerHeight - y)),
        width: Math.max(1, Math.min(rect.width, window.innerWidth - x)),
        x,
        y,
      };
    }

    function uniqueStrings(values: readonly string[]): readonly string[] {
      return [...new Set(values)].sort((left, right) =>
        left.localeCompare(right),
      );
    }
  }, surfaceId);
}

export async function resolveRetainedCompositorViewportPoint(
  page: Page,
): Promise<RetainedCompositorPoint> {
  return await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(
      ".setta-gpu-flow__canvas",
    );
    if (!canvas) {
      throw new Error("Missing GPU flow canvas.");
    }
    const box = canvas.getBoundingClientRect();
    const candidates = [
      [0.08, 0.92],
      [0.92, 0.92],
      [0.08, 0.08],
      [0.92, 0.08],
      [0.55, 0.52],
    ] as const;
    for (const [xRatio, yRatio] of candidates) {
      const x = box.left + box.width * xRatio;
      const y = box.top + box.height * yRatio;
      const target = document.elementFromPoint(x, y);
      if (
        target?.closest(".setta-gpu-flow__pane") &&
        !target.closest(".nowheel, .nopan")
      ) {
        return { x, y };
      }
    }
    return {
      x: box.left + box.width * 0.55,
      y: box.top + box.height * 0.52,
    };
  });
}

export async function measureRetainedCompositorGesture(
  page: Page,
  operation: () => Promise<readonly number[]>,
  options: { readonly settleMs?: number | undefined } = {},
): Promise<RetainedCompositorGestureResult> {
  await startRetainedCompositorGestureFrameSampler(page);
  const eventSpacingMs = await operation();
  const settleMs = options.settleMs ?? 180;
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
  const sample = await stopRetainedCompositorGestureFrameSampler(page);
  return {
    eventSpacing: summarizeRetainedCompositorIntervals(eventSpacingMs),
    frame: summarizeRetainedCompositorIntervals(sample.intervalsMs),
    longTasks: {
      count: sample.longTasks.length,
      entries: sample.longTasks,
      maxDurationMs: Math.max(
        0,
        ...sample.longTasks.map((task) => task.durationMs),
      ),
    },
  };
}

export async function dispatchRetainedCompositorWheelBurst(
  page: Page,
  input: {
    readonly ctrlKey?: boolean | undefined;
    readonly deltaX?: number | undefined;
    readonly deltaY: number;
    readonly eventCount: number;
    readonly point: RetainedCompositorPoint;
  },
): Promise<readonly number[]> {
  const timestamps: number[] = [];
  for (let index = 0; index < input.eventCount; index += 1) {
    timestamps.push(performance.now());
    await page.evaluate(({ ctrlKey = false, deltaX = 0, deltaY, point }) => {
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
          ctrlKey,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          deltaX,
          deltaY,
          view: window,
        }),
      );
    }, input);
    await new Promise<void>((resolve) =>
      setTimeout(resolve, GESTURE_SPACING_MS),
    );
  }
  return timestamps.slice(1).map((timestamp, index) => {
    const previous = timestamps[index] ?? timestamp;
    return timestamp - previous;
  });
}

export async function runNativeRetainedCompositorWheelBurst(
  page: Page,
  input: {
    readonly ctrlKey?: boolean | undefined;
    readonly deltaX?: number | undefined;
    readonly deltaY: number;
    readonly eventCount: number;
    readonly point: RetainedCompositorPoint;
  },
): Promise<readonly number[]> {
  const timestamps: number[] = [];
  await page.mouse.move(input.point.x, input.point.y);
  if (input.ctrlKey) {
    await page.keyboard.down("Control");
  }
  try {
    for (let index = 0; index < input.eventCount; index += 1) {
      timestamps.push(performance.now());
      await page.mouse.wheel(input.deltaX ?? 0, input.deltaY);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, GESTURE_SPACING_MS),
      );
    }
  } finally {
    if (input.ctrlKey) {
      await page.keyboard.up("Control");
    }
  }
  return timestamps.slice(1).map((timestamp, index) => {
    const previous = timestamps[index] ?? timestamp;
    return timestamp - previous;
  });
}

export async function warmRetainedCompositorNativeWheelTarget(
  page: Page,
  point: RetainedCompositorPoint,
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, 1);
  await waitForRetainedCompositorGestureIdle(page);
}

export async function captureRetainedCompositorVisualStats(
  page: Page,
  clip: Rect,
): Promise<RetainedCompositorVisualStats> {
  const screenshot = await page.screenshot({ clip: normalizeClip(clip) });
  return await page.evaluate(
    async ({ screenshotDataUrl }) => {
      const image = await loadImage(screenshotDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing retained compositor visual analysis context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      let nonblankPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        const a = data[index + 3] ?? 0;
        if (
          a > 12 &&
          (Math.max(r, g, b) - Math.min(r, g, b) > 8 || Math.max(r, g, b) > 32)
        ) {
          nonblankPixels += 1;
        }
      }
      return {
        height,
        nonblankRatio:
          width * height === 0 ? 0 : nonblankPixels / (width * height),
        width,
      };

      function loadImage(dataUrl: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () =>
            reject(new Error("Could not decode retained screenshot."));
          image.src = dataUrl;
        });
      }
    },
    {
      screenshotDataUrl: `data:image/png;base64,${screenshot.toString(
        "base64",
      )}`,
    },
  );
}

export async function measureRetainedCompositorControlCadence(
  page: Page,
): Promise<PageRafCadence> {
  return await measurePageRafCadence(page);
}

export async function waitForRetainedCompositorGestureIdle(
  page: Page,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const longTaskCount = await countRetainedCompositorLongTasksDuringWindow(
      page,
      320,
    );
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);
    if (longTaskCount === 0) {
      return;
    }
  }
}

async function countRetainedCompositorLongTasksDuringWindow(
  page: Page,
  durationMs: number,
): Promise<number> {
  const observing = await page.evaluate(() => {
    if (
      !("PerformanceObserver" in window) ||
      !PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      return false;
    }
    const view = window as typeof window & {
      __SETTA_RETAINED_COMPOSITOR_LONG_TASK_PROBE__?:
        | {
            count: number;
            observer: PerformanceObserver;
          }
        | undefined;
    };
    view.__SETTA_RETAINED_COMPOSITOR_LONG_TASK_PROBE__?.observer.disconnect();
    const probe = {
      count: 0,
      observer: null as PerformanceObserver | null,
    };
    const observer = new PerformanceObserver((list) => {
      probe.count += list.getEntries().length;
    });
    probe.observer = observer;
    view.__SETTA_RETAINED_COMPOSITOR_LONG_TASK_PROBE__ = probe as {
      count: number;
      observer: PerformanceObserver;
    };
    observer.observe({ entryTypes: ["longtask"] });
    return true;
  });
  await page.waitForTimeout(durationMs);
  if (!observing) {
    return 0;
  }
  return await page.evaluate(() => {
    const view = window as typeof window & {
      __SETTA_RETAINED_COMPOSITOR_LONG_TASK_PROBE__?:
        | {
            count: number;
            observer: PerformanceObserver;
          }
        | undefined;
    };
    const probe = view.__SETTA_RETAINED_COMPOSITOR_LONG_TASK_PROBE__;
    if (!probe) {
      return 0;
    }
    probe.observer.disconnect();
    delete view.__SETTA_RETAINED_COMPOSITOR_LONG_TASK_PROBE__;
    return probe.count;
  });
}

export function resolveRetainedCompositorCadenceBudget({
  controlCadence,
  eventSpacing,
}: {
  readonly controlCadence: PageRafCadence;
  readonly eventSpacing: RetainedCompositorIntervalStats;
}): RetainedCompositorCadenceBudget {
  if (
    retainedCompositorCanMeasureStrictLocal120Hz(controlCadence) &&
    retainedCompositorCanMeasureStrictGestureCadence(eventSpacing)
  ) {
    return {
      lane: "local-120hz",
      longTaskBudgetMs: 50,
      maxFrameBudgetMs: 50,
      p95FrameBudgetMs: Math.min(
        STRICT_BASELINE_P95_FRAME_BUDGET_MS,
        Math.max(
          STRICT_P95_FRAME_BUDGET_MS,
          controlCadence.p95Ms + STRICT_FRAME_TIMER_JITTER_EPSILON_MS,
        ),
      ),
      p99FrameBudgetMs: STRICT_P99_FRAME_BUDGET_MS,
      slowFrameRatioBudget: 0.02,
    };
  }
  const cappedFrameBudgetMs = Math.max(
    STRICT_P95_FRAME_BUDGET_MS,
    controlCadence.p95Ms + 4,
    eventSpacing.p95Ms + 4,
  );
  const cappedMaxFrameBudgetMs = Math.max(
    CAPPED_MAX_FRAME_BUDGET_MS,
    controlCadence.maxMs + CAPPED_FRAME_TIMER_JITTER_EPSILON_MS,
    eventSpacing.maxMs + CAPPED_FRAME_TIMER_JITTER_EPSILON_MS,
  );
  return {
    lane: "ci-capped",
    longTaskBudgetMs: Math.max(
      CAPPED_LONG_TASK_BUDGET_MS,
      cappedMaxFrameBudgetMs,
    ),
    maxFrameBudgetMs: cappedMaxFrameBudgetMs,
    p95FrameBudgetMs: cappedFrameBudgetMs,
    p99FrameBudgetMs: Math.max(
      CAPPED_P99_FRAME_BUDGET_MS,
      cappedFrameBudgetMs,
      cappedMaxFrameBudgetMs,
    ),
    slowFrameRatioBudget: 1,
  };
}

function retainedCompositorCanMeasureStrictLocal120Hz(
  controlCadence: PageRafCadence,
): boolean {
  return (
    controlCadence.p50Ms <= STRICT_BASELINE_P50_FRAME_BUDGET_MS &&
    controlCadence.p95Ms <= STRICT_BASELINE_P95_FRAME_BUDGET_MS
  );
}

function retainedCompositorCanMeasureStrictGestureCadence(
  eventSpacing: RetainedCompositorIntervalStats,
): boolean {
  return eventSpacing.p95Ms <= STRICT_GESTURE_EVENT_P95_BUDGET_MS;
}

export function expectRetainedCompositorGestureWithinBudget({
  budget,
  details,
  gesture,
}: {
  readonly budget: RetainedCompositorCadenceBudget;
  readonly details: string;
  readonly gesture: RetainedCompositorGestureResult;
}) {
  expect(gesture.frame.count, details).toBeGreaterThan(6);
  expect(gesture.frame.p95Ms, details).toBeLessThanOrEqual(
    budget.p95FrameBudgetMs,
  );
  const p99FrameBudgetMs =
    budget.lane === "ci-capped"
      ? budget.p99FrameBudgetMs + CAPPED_FRAME_TIMER_JITTER_EPSILON_MS
      : budget.p99FrameBudgetMs;
  expect(gesture.frame.p99Ms, details).toBeLessThanOrEqual(p99FrameBudgetMs);
  const maxFrameBudgetMs =
    budget.lane === "ci-capped"
      ? budget.maxFrameBudgetMs + CAPPED_FRAME_TIMER_JITTER_EPSILON_MS
      : budget.maxFrameBudgetMs;
  expect(gesture.frame.maxMs, details).toBeLessThanOrEqual(maxFrameBudgetMs);
  expect(gesture.frame.slowFrameRatio, details).toBeLessThanOrEqual(
    budget.slowFrameRatioBudget,
  );
  expect(gesture.longTasks.maxDurationMs, details).toBeLessThanOrEqual(
    budget.longTaskBudgetMs,
  );
}

export async function readRetainedCompositorViewport(
  page: Page,
): Promise<RetainedCompositorViewportSample> {
  return await page.evaluate(() => {
    const transform =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
    if (!transform) {
      throw new Error("Missing GPU flow viewport debug transform.");
    }
    return transform;
  });
}

export async function readRetainedCompositorScrollSignature(
  page: Page,
  surfaceId = SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
): Promise<RetainedCompositorScrollSignature> {
  return await page.evaluate((targetSurfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === targetSurfaceId,
      )
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    return {
      firstRowId: rows[0]?.rowId ?? null,
      firstRowY: rows[0] ? Math.round(rows[0].clientRect.y * 10) / 10 : null,
      lastRowId: rows.at(-1)?.rowId ?? null,
      rowCount: rows.length,
    };
  }, surfaceId);
}

export async function readNativePageScrollY(page: Page): Promise<number> {
  return await page.evaluate(() => window.scrollY);
}

export async function readRetainedCompositorRowCount(
  page: Page,
): Promise<number> {
  return await page.evaluate(
    () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
  );
}

export async function readRetainedCompositorSceneSummary(page: Page): Promise<{
  readonly controlKinds: readonly string[];
  readonly mountedNodeCount: number;
  readonly nodeCount: number;
  readonly retainedRowCount: number;
  readonly surfaceCount: number;
}> {
  return await page.evaluate(() => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const sceneSummary =
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_SCENE_SUMMARY__?.() ?? null;
    const mountedNodeCount = document.querySelectorAll(
      ".setta-gpu-flow__node",
    ).length;
    const retainedNodeCount = new Set(rows.map((row) => row.ownerSectionId))
      .size;
    return {
      controlKinds:
        sceneSummary?.controlKinds ??
        [
          ...new Set(
            rows
              .map((row) => row.controlKind)
              .filter((kind): kind is string => Boolean(kind)),
          ),
        ].sort((left, right) => left.localeCompare(right)),
      mountedNodeCount,
      nodeCount:
        sceneSummary?.nodeCount ?? Math.max(mountedNodeCount, retainedNodeCount),
      retainedRowCount: sceneSummary?.retainedRowCount ?? rows.length,
      surfaceCount:
        sceneSummary?.surfaceCount ??
        new Set(rows.map((row) => row.surfaceId)).size,
    };
  });
}

export function recordRetainedCompositorPerfSample({
  name,
  sample,
}: {
  readonly name: string;
  readonly sample: unknown;
}) {
  const outputPath = process.env.SETTA_RETAINED_COMPOSITOR_PERF_JSONL;
  if (!outputPath) {
    return;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  appendFileSync(
    outputPath,
    `${JSON.stringify({
      name,
      recordedAt: new Date().toISOString(),
      sample,
    })}\n`,
  );
}

export async function installOptionalRetainedCompositorFrameProbe(page: Page) {
  await page.addInitScript(() => {
    const samples: unknown[] = [];
    (
      window as Window & {
        __settaRetainedCompositorFrameProbe?: typeof samples;
        __settaGpuFlowPerformanceProbe?: {
          readonly recordNodeLayerFrame: (event: unknown) => void;
        };
      }
    ).__settaRetainedCompositorFrameProbe = samples;
    (
      window as Window & {
        __settaGpuFlowPerformanceProbe?: {
          readonly recordNodeLayerFrame: (event: unknown) => void;
        };
      }
    ).__settaGpuFlowPerformanceProbe = {
      recordNodeLayerFrame(event: unknown) {
        samples.push(event);
        if (samples.length > 240) {
          samples.shift();
        }
      },
    };
  });
}

export async function readOptionalRetainedCompositorFrameProbe(page: Page) {
  return await page.evaluate(() => {
    const samples =
      (
        window as Window & {
          readonly __settaRetainedCompositorFrameProbe?: readonly unknown[];
        }
      ).__settaRetainedCompositorFrameProbe ?? [];
    return samples
      .map((sample) => {
        const event =
          sample && typeof sample === "object"
            ? (sample as Record<string, unknown>)
            : {};
        return {
          deferResolutionUpdates: event.deferResolutionUpdates,
          durationMs: event.durationMs,
          frame: event.frame,
          frameReasons: event.frameReasons,
          retainedTexturePageDrawQuadCount:
            event.retainedTexturePageDrawQuadCount,
          retainedTexturePageRasterMs: event.retainedTexturePageRasterMs,
          retainedTexturePageRefinementPageCount:
            event.retainedTexturePageRefinementPageCount,
          retainedTexturePageTargetDescriptorCount:
            event.retainedTexturePageTargetDescriptorCount,
          retainedTexturePageDiagnosticCount:
            event.retainedTexturePageDiagnosticCount,
          retainedTexturePageDiagnostics: event.retainedTexturePageDiagnostics,
          retainedTexturePageExecutedItems:
            event.retainedTexturePageExecutedItems,
          retainedTexturePageSurfaceCoverageTrueHoleCount:
            event.retainedTexturePageSurfaceCoverageTrueHoleCount,
          retainedTexturePageTransactionBlockingGenerationIds:
            event.retainedTexturePageTransactionBlockingGenerationIds,
          retainedTexturePageTransactionBlockingSurfaceIds:
            event.retainedTexturePageTransactionBlockingSurfaceIds,
          retainedTexturePageTransactionDesiredScrollOffset:
            event.retainedTexturePageTransactionDesiredScrollOffset,
          retainedTexturePageTransactionDesiredViewport:
            event.retainedTexturePageTransactionDesiredViewport,
          retainedTexturePageTransactionHeldMotionFrameCount:
            event.retainedTexturePageTransactionHeldMotionFrameCount,
          retainedTexturePageTransactionHeldTransactionCount:
            event.retainedTexturePageTransactionHeldTransactionCount,
          retainedTexturePageTransactionHeldTransactionDurationMs:
            event.retainedTexturePageTransactionHeldTransactionDurationMs,
          retainedTexturePageTransactionHoldReason:
            event.retainedTexturePageTransactionHoldReason,
          retainedTexturePageTransactionMaxHeldMotionAgeMs:
            event.retainedTexturePageTransactionMaxHeldMotionAgeMs,
          retainedTexturePageTransactionOutcome:
            event.retainedTexturePageTransactionOutcome,
          retainedTexturePageTransactionPublishedScrollOffset:
            event.retainedTexturePageTransactionPublishedScrollOffset,
          retainedTexturePageTransactionPublishedViewport:
            event.retainedTexturePageTransactionPublishedViewport,
          retainedTexturePageTrueHoleRectCount:
            event.retainedTexturePageTrueHoleRectCount,
          retainedTexturePageUploadedBytes:
            event.retainedTexturePageUploadedBytes,
          retainedTexturePageUploadedDrawCommandCount:
            event.retainedTexturePageUploadedDrawCommandCount,
          retainedTexturePageUploadCount: event.retainedTexturePageUploadCount,
          retainedTexturePageUploadMs: event.retainedTexturePageUploadMs,
          viewport: event.viewport,
          viewportFrame: event.viewportFrame,
        };
      })
      .filter(
        (sample) =>
          Number(sample.durationMs) >= 16 ||
          Number(sample.retainedTexturePageTransactionHeldTransactionCount) >
            0 ||
          Number(sample.retainedTexturePageUploadCount) > 0 ||
          Number(sample.retainedTexturePageTrueHoleRectCount) > 0,
      )
      .slice(-80);
  });
}

export function summarizeRetainedCompositorIntervals(
  values: readonly number[],
): RetainedCompositorIntervalStats {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: values.length,
    maxMs: sorted[sorted.length - 1] ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    slowFrameRatio:
      values.length === 0
        ? 0
        : values.filter((interval) => interval > 16.7).length / values.length,
  };
}

function normalizeClip(rect: Rect): Rect {
  return {
    height: Math.max(1, Math.floor(rect.height)),
    width: Math.max(1, Math.floor(rect.width)),
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
  };
}
