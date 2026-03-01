import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const VIEWPORT_LAYER_SPLIT_KEY = "setta.viewportLayerSplit.enabled";

type GuardrailMetrics = {
  throughput: {
    panFps: number;
    zoomFps: number;
  };
  startHitch: {
    p95Ms: number;
  };
  dom: {
    viewportLayerSplitEnabled: boolean;
    topLevelSectionCount: number;
  };
};

test("settings all-settings viewport-layer-split guardrail", async ({
  page,
}, testInfo) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "1");
  }, VIEWPORT_LAYER_SPLIT_KEY);

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
    () => document.querySelectorAll(".react-flow__node").length >= 42,
  );

  const fitViewButton = page.getByRole("button", { name: "fit view" });
  await expect(fitViewButton).toBeVisible();
  await fitViewButton.click();
  await page.waitForTimeout(200);

  const metrics = await page.evaluate(async (): Promise<GuardrailMetrics> => {
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const nextFrame = (): Promise<number> =>
      new Promise((resolve) =>
        requestAnimationFrame(() => resolve(performance.now())),
      );

    const renderer = document.querySelector(".react-flow__renderer");
    const fitButton = document.querySelector(
      'button[aria-label="fit view"]',
    );
    const viewport = document.querySelector(".react-flow__viewport");
    if (!(renderer instanceof HTMLElement)) {
      throw new Error("Missing .react-flow__renderer.");
    }
    if (!(fitButton instanceof HTMLButtonElement)) {
      throw new Error('Missing button[aria-label="fit view"].');
    }

    const percentile95 = (values: number[]): number => {
      const sorted = values.slice().sort((a, b) => a - b);
      const idx = Math.floor(0.95 * (sorted.length - 1));
      return sorted[idx] ?? 0;
    };

    const viewportRect = (): DOMRect => renderer.getBoundingClientRect();

    const getPointerCenter = (): { x: number; y: number } => {
      const rect = viewportRect();
      return {
        x: rect.left + rect.width * 0.52,
        y: rect.top + rect.height * 0.48,
      };
    };

    const resetView = async (): Promise<void> => {
      fitButton.click();
      await sleep(180);
    };

    const dispatchPanWheel = (frame: number): void => {
      const pointer = getPointerCenter();
      renderer.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: pointer.x,
          clientY: pointer.y,
          deltaX: (frame % 2 === 0 ? 1 : -1) * 14,
          deltaY: (frame % 3 === 0 ? 1 : -1) * 20,
        }),
      );
    };

    const dispatchZoomWheel = (frame: number): void => {
      const pointer = getPointerCenter();
      renderer.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: pointer.x,
          clientY: pointer.y,
          ctrlKey: true,
          deltaY: frame % 2 === 0 ? -36 : 36,
        }),
      );
    };

    await resetView();
    let start = performance.now();
    let panFrames = 0;
    while (performance.now() - start < 1200) {
      dispatchPanWheel(panFrames);
      await nextFrame();
      panFrames += 1;
    }
    const panElapsed = performance.now() - start;

    await resetView();
    start = performance.now();
    let zoomFrames = 0;
    while (performance.now() - start < 900) {
      dispatchZoomWheel(zoomFrames);
      await nextFrame();
      zoomFrames += 1;
    }
    const zoomElapsed = performance.now() - start;

    const startSamples: number[] = [];
    for (let trial = 0; trial < 16; trial += 1) {
      await resetView();
      const t0 = performance.now();
      dispatchPanWheel(trial);
      const t1 = await nextFrame();
      startSamples.push(t1 - t0);
    }

    return {
      throughput: {
        panFps: Number(((panFrames * 1000) / panElapsed).toFixed(1)),
        zoomFps: Number(((zoomFrames * 1000) / zoomElapsed).toFixed(1)),
      },
      startHitch: {
        p95Ms: Number(percentile95(startSamples).toFixed(2)),
      },
      dom: {
        viewportLayerSplitEnabled:
          viewport?.getAttribute("data-viewport-layer-split") === "true",
        topLevelSectionCount: document.querySelectorAll(".react-flow__node")
          .length,
      },
    };
  });

  expect(metrics.dom.viewportLayerSplitEnabled).toBe(true);
  expect(metrics.dom.topLevelSectionCount).toBeGreaterThanOrEqual(40);
  expect(metrics.throughput.panFps).toBeGreaterThan(80);
  expect(metrics.throughput.zoomFps).toBeGreaterThan(80);
  expect(metrics.startHitch.p95Ms).toBeLessThan(12);

  const metricsJson = JSON.stringify(metrics, null, 2);
  await testInfo.attach("settings-all-settings-viewport-layer-split-guardrail.json", {
    body: metricsJson,
    contentType: "application/json",
  });
  console.info(
    `[settings-all-settings-viewport-layer-split-guardrail] ${JSON.stringify(metrics)}`,
  );
});
