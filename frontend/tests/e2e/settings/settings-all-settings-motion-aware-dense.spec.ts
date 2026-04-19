import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type ViewportTransform = {
  x: number;
  y: number;
  zoom: number;
};

type DeltaStats = {
  frameCount: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  over16Ms: number;
  over33Ms: number;
};

type LongTaskStats = {
  supported: boolean;
  count: number;
  totalMs: number;
  maxMs: number;
};

type BlankPanePoint = {
  x: number;
  y: number;
};

type MotionHiddenBodyStats = {
  frameSamples: number;
  framesWithHiddenBodies: number;
  peakHiddenBodyCount: number;
  settledHiddenBodyCount: number;
  totalMotionBodyRootCount: number;
};

type MotionAwareDenseMetrics = {
  blankPanePoint: BlankPanePoint;
  viewModeName: string;
  flowNodeCount: number;
  visibleFlowNodeCount: number;
  documentNodeCount: number;
  inputCount: number;
  textareaCount: number;
  buttonCount: number;
  canvasCount: number;
  codeMirrorCount: number;
  sampleSectionIds: string[];
  viewportStart: ViewportTransform;
  viewportEnd: ViewportTransform;
  raf: DeltaStats;
  longTasks: LongTaskStats;
  motionHiddenBodies: MotionHiddenBodyStats;
};

test("settings All Settings motion-aware dense probe reports real viewport-motion metrics", async ({
  page,
}, testInfo) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node").length > 13,
  );
  await clickFitViewIfVisible(page);
  await page.waitForFunction(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    );
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const visibleNodeCount = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right >= 0 &&
        rect.bottom >= 0 &&
        rect.left <= windowWidth &&
        rect.top <= windowHeight
      );
    }).length;
    return visibleNodeCount > 20;
  });

  const blankPanePoint = await findBlankPanePoint(page);
  await page.mouse.click(blankPanePoint.x, blankPanePoint.y);
  await page.waitForTimeout(250);

  const metrics = await measureAllSettingsMotionAwareDense(page, blankPanePoint);
  await testInfo.attach("all-settings-motion-aware-dense-metrics", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_MOTION_AWARE_DENSE_METRICS ${JSON.stringify(
      metrics,
      null,
      2,
    )}`,
  );

  expect(metrics.flowNodeCount).toBeGreaterThan(13);
  expect(metrics.visibleFlowNodeCount).toBeGreaterThan(20);
  expect(metrics.raf.frameCount).toBeGreaterThan(80);
  expect(metrics.motionHiddenBodies.totalMotionBodyRootCount).toBeGreaterThan(0);
  expect(metrics.motionHiddenBodies.peakHiddenBodyCount).toBeGreaterThan(0);
  expect(metrics.motionHiddenBodies.settledHiddenBodyCount).toBe(0);
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button", { name: "fit view" });
  if (await fitView.isVisible()) {
    await fitView.click();
  }
}

async function findBlankPanePoint(page: Page): Promise<BlankPanePoint> {
  return page.evaluate((): BlankPanePoint => {
    const pane = document.querySelector<HTMLElement>(".react-flow__pane");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("Missing .react-flow__pane");
    }

    const paneRect = pane.getBoundingClientRect();
    const nodeRects = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    ).map((node) => node.getBoundingClientRect());

    for (let y = paneRect.top + 24; y < paneRect.bottom - 24; y += 24) {
      for (let x = paneRect.left + 24; x < paneRect.right - 24; x += 24) {
        const overlapsNode = nodeRects.some(
          (rect) =>
            x >= rect.left - 8 &&
            x <= rect.right + 8 &&
            y >= rect.top - 8 &&
            y <= rect.bottom + 8,
        );
        if (!overlapsNode) {
          return { x, y };
        }
      }
    }

    throw new Error("Unable to find a blank pane point for motion probe.");
  });
}

async function measureAllSettingsMotionAwareDense(
  page: Page,
  blankPanePoint: BlankPanePoint,
): Promise<MotionAwareDenseMetrics> {
  return page.evaluate(async (targetPoint): Promise<MotionAwareDenseMetrics> => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!(viewport instanceof HTMLElement)) {
      throw new Error("Missing .react-flow__viewport");
    }

    const renderer = document.querySelector<HTMLElement>(".react-flow__renderer");
    if (!(renderer instanceof HTMLElement)) {
      throw new Error("Missing .react-flow__renderer");
    }

    const parseTransform = (): ViewportTransform => {
      const computed = window.getComputedStyle(viewport).transform;
      if (!computed || computed === "none") {
        return { x: 0, y: 0, zoom: 1 };
      }
      const matrix = new DOMMatrixReadOnly(computed);
      return { x: matrix.e, y: matrix.f, zoom: matrix.a || 1 };
    };

    const readHiddenBodyCount = (): number =>
      document.querySelectorAll('[data-canvas-owned-motion-body-hidden="true"]')
        .length;

    const flowNodes = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    );
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const visibleFlowNodeCount = flowNodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right >= 0 &&
        rect.bottom >= 0 &&
        rect.left <= windowWidth &&
        rect.top <= windowHeight
      );
    }).length;

    const longTaskDurations: number[] = [];
    let longTaskSupported = false;
    let longTaskObserver: PerformanceObserver | null = null;
    if (typeof PerformanceObserver === "function") {
      try {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTaskDurations.push(entry.duration);
          }
        });
        longTaskObserver.observe({ entryTypes: ["longtask"] });
        longTaskSupported = true;
      } catch {
        longTaskObserver = null;
      }
    }

    const viewportStart = parseTransform();
    const totalMotionBodyRootCount = document.querySelectorAll(
      '[data-canvas-owned-motion-body-root="true"]',
    ).length;
    const rafDeltas: number[] = [];
    const totalFrames = 120;
    let motionSampleCount = 0;
    let motionHiddenBodyPeakCount = 0;
    let motionHiddenBodyFrames = 0;

    await new Promise<void>((resolve) => {
      let frame = 0;
      let previousTimestamp = 0;

      const step = (timestamp: number) => {
        if (previousTimestamp !== 0) {
          rafDeltas.push(timestamp - previousTimestamp);
        }
        previousTimestamp = timestamp;

        const hiddenBodyCount = readHiddenBodyCount();
        motionSampleCount += 1;
        if (hiddenBodyCount > 0) {
          motionHiddenBodyFrames += 1;
        }
        motionHiddenBodyPeakCount = Math.max(
          motionHiddenBodyPeakCount,
          hiddenBodyCount,
        );

        const cycle = frame % 12;
        const deltaY = cycle < 6 ? -160 : 160;
        renderer.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: targetPoint.x,
            clientY: targetPoint.y,
            deltaMode: WheelEvent.DOM_DELTA_PIXEL,
            deltaY,
          }),
        );

        frame += 1;
        if (frame < totalFrames) {
          window.requestAnimationFrame(step);
          return;
        }
        resolve();
      };

      window.requestAnimationFrame(step);
    });

    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 260);
    });
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    longTaskObserver?.disconnect();

    const sortedDeltas = [...rafDeltas].sort((left, right) => left - right);
    const percentile = (ratio: number): number => {
      if (sortedDeltas.length === 0) {
        return 0;
      }
      const index = Math.min(
        sortedDeltas.length - 1,
        Math.max(0, Math.floor((sortedDeltas.length - 1) * ratio)),
      );
      return sortedDeltas[index] ?? 0;
    };
    const totalDeltaMs = rafDeltas.reduce((sum, value) => sum + value, 0);
    const maxDeltaMs = rafDeltas.reduce(
      (max, value) => Math.max(max, value),
      0,
    );
    const longTaskTotalMs = longTaskDurations.reduce(
      (sum, value) => sum + value,
      0,
    );
    const longTaskMaxMs = longTaskDurations.reduce(
      (max, value) => Math.max(max, value),
      0,
    );

    return {
      blankPanePoint: targetPoint,
      viewModeName: "All Settings",
      flowNodeCount: flowNodes.length,
      visibleFlowNodeCount,
      documentNodeCount: document.getElementsByTagName("*").length,
      inputCount: document.querySelectorAll("input").length,
      textareaCount: document.querySelectorAll("textarea").length,
      buttonCount: document.querySelectorAll("button").length,
      canvasCount: document.querySelectorAll("canvas").length,
      codeMirrorCount: document.querySelectorAll(".cm-editor").length,
      sampleSectionIds: flowNodes
        .map((node) => node.dataset.id ?? "")
        .filter((id) => id.length > 0)
        .slice(0, 8),
      viewportStart,
      viewportEnd: parseTransform(),
      raf: {
        frameCount: rafDeltas.length,
        meanMs:
          rafDeltas.length > 0
            ? Number((totalDeltaMs / rafDeltas.length).toFixed(2))
            : 0,
        p50Ms: Number(percentile(0.5).toFixed(2)),
        p95Ms: Number(percentile(0.95).toFixed(2)),
        maxMs: Number(maxDeltaMs.toFixed(2)),
        over16Ms: rafDeltas.filter((value) => value > 16.7).length,
        over33Ms: rafDeltas.filter((value) => value > 33.3).length,
      },
      longTasks: {
        supported: longTaskSupported,
        count: longTaskDurations.length,
        totalMs: Number(longTaskTotalMs.toFixed(2)),
        maxMs: Number(longTaskMaxMs.toFixed(2)),
      },
      motionHiddenBodies: {
        frameSamples: motionSampleCount,
        framesWithHiddenBodies: motionHiddenBodyFrames,
        peakHiddenBodyCount: motionHiddenBodyPeakCount,
        settledHiddenBodyCount: readHiddenBodyCount(),
        totalMotionBodyRootCount,
      },
    };
  }, blankPanePoint);
}
