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

type BaselineMetrics = {
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
};

test("settings All Settings baseline probe reports current motion and DOM metrics", async ({
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
  await page.waitForTimeout(500);

  const metrics = await measureAllSettingsBaseline(page);
  await testInfo.attach("all-settings-baseline-metrics", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_BASELINE_METRICS ${JSON.stringify(metrics, null, 2)}`,
  );

  expect(metrics.flowNodeCount).toBeGreaterThan(13);
  expect(metrics.visibleFlowNodeCount).toBeGreaterThan(0);
  expect(metrics.raf.frameCount).toBeGreaterThan(100);
});

async function measureAllSettingsBaseline(page: Page): Promise<BaselineMetrics> {
  return page.evaluate(async (): Promise<BaselineMetrics> => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport) {
      throw new Error("Missing .react-flow__viewport");
    }

    const parseTransform = (): ViewportTransform => {
      const computed = window.getComputedStyle(viewport).transform;
      if (!computed || computed === "none") {
        return { x: 0, y: 0, zoom: 1 };
      }
      const matrix = new DOMMatrixReadOnly(computed);
      return { x: matrix.e, y: matrix.f, zoom: matrix.a || 1 };
    };

    const originalTransform = window.getComputedStyle(viewport).transform;
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
    const rafDeltas: number[] = [];
    const totalFrames = 180;

    await new Promise<void>((resolve) => {
      let frame = 0;
      let previousTimestamp = 0;

      const step = (timestamp: number) => {
        if (previousTimestamp !== 0) {
          rafDeltas.push(timestamp - previousTimestamp);
        }
        previousTimestamp = timestamp;

        const nextX =
          viewportStart.x + Math.sin(frame / 10) * 140 + frame * 0.45;
        const nextY =
          viewportStart.y + Math.cos(frame / 12) * 95 - frame * 0.25;
        const nextZoom =
          viewportStart.zoom * (1 + Math.sin(frame / 14) * 0.035);
        viewport.style.transform = `translate(${nextX}px, ${nextY}px) scale(${nextZoom})`;

        frame += 1;
        if (frame < totalFrames) {
          window.requestAnimationFrame(step);
          return;
        }
        resolve();
      };

      window.requestAnimationFrame(step);
    });

    longTaskObserver?.disconnect();
    viewport.style.transform = originalTransform === "none" ? "" : originalTransform;

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
    };
  });
}
