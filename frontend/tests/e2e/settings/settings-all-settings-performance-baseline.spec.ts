import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const VIEWPORT_LAYER_SPLIT_KEY = "setta.viewportLayerSplit.enabled";
const ENABLE_VIEWPORT_LAYER_SPLIT =
  process.env.PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT === "1";

type HitchStats = {
  avgMs: number;
  p95Ms: number;
  worstMs: number;
};

type ThroughputStats = {
  panFps: number;
  zoomFps: number;
};

type TypingStats = {
  avgFrameMs: number;
  p95FrameMs: number;
  worstFrameMs: number;
  samples: number;
};

type DomStats = {
  totalNodes: number;
  topLevelSectionCount: number;
  visibleSectionCount: number;
  iconLikeNodeCount: number;
  viewportLayerSplitEnabled: boolean;
};

type BaselineMetrics = {
  throughput: ThroughputStats;
  startHitch: HitchStats;
  stopHitch: HitchStats;
  typing: TypingStats;
  dom: DomStats;
};

test("settings all-settings perf baseline harness", async ({
  page,
}, testInfo) => {
  if (ENABLE_VIEWPORT_LAYER_SPLIT) {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, "1");
    }, VIEWPORT_LAYER_SPLIT_KEY);
  } else {
    await page.addInitScript((key) => {
      window.localStorage.removeItem(key);
    }, VIEWPORT_LAYER_SPLIT_KEY);
  }

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

  const metrics = await page.evaluate(async (): Promise<BaselineMetrics> => {
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const nextFrame = (): Promise<number> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));

    const renderer = document.querySelector(".react-flow__renderer");
    const fitButton = document.querySelector(
      'button[aria-label="fit view"]',
    );
    if (!(renderer instanceof HTMLElement)) {
      throw new Error("Missing .react-flow__renderer.");
    }
    if (!(fitButton instanceof HTMLButtonElement)) {
      throw new Error('Missing button[aria-label="fit view"].');
    }

    const medianP95 = (values: number[]): number => {
      const sorted = values.slice().sort((a, b) => a - b);
      const idx = Math.floor(0.95 * (sorted.length - 1));
      return sorted[idx] ?? 0;
    };

    const average = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

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

    const measureThroughput = async (): Promise<ThroughputStats> => {
      await resetView();
      let start = performance.now();
      let panFrames = 0;
      while (performance.now() - start < 1400) {
        dispatchPanWheel(panFrames);
        await nextFrame();
        panFrames += 1;
      }
      const panElapsed = performance.now() - start;

      await resetView();
      start = performance.now();
      let zoomFrames = 0;
      while (performance.now() - start < 1100) {
        dispatchZoomWheel(zoomFrames);
        await nextFrame();
        zoomFrames += 1;
      }
      const zoomElapsed = performance.now() - start;

      return {
        panFps: Number(((panFrames * 1000) / panElapsed).toFixed(1)),
        zoomFps: Number(((zoomFrames * 1000) / zoomElapsed).toFixed(1)),
      };
    };

    const measureStartHitch = async (): Promise<HitchStats> => {
      const samples: number[] = [];
      for (let trial = 0; trial < 24; trial += 1) {
        await resetView();
        const t0 = performance.now();
        dispatchPanWheel(trial);
        const t1 = await nextFrame();
        samples.push(t1 - t0);
      }
      return {
        avgMs: Number(average(samples).toFixed(2)),
        p95Ms: Number(medianP95(samples).toFixed(2)),
        worstMs: Number(Math.max(...samples).toFixed(2)),
      };
    };

    const measureStopHitch = async (): Promise<HitchStats> => {
      const samples: number[] = [];
      for (let trial = 0; trial < 20; trial += 1) {
        await resetView();
        for (let frame = 0; frame < 18; frame += 1) {
          dispatchPanWheel(frame + trial);
          await nextFrame();
        }
        const t0 = performance.now();
        const t1 = await nextFrame();
        samples.push(t1 - t0);
      }
      return {
        avgMs: Number(average(samples).toFixed(2)),
        p95Ms: Number(medianP95(samples).toFixed(2)),
        worstMs: Number(Math.max(...samples).toFixed(2)),
      };
    };

    const measureTypingLatency = async (): Promise<TypingStats> => {
      await resetView();
      const viewport = viewportRect();
      const visibleSections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-section-id]"),
      )
        .filter((section) => {
          const rect = section.getBoundingClientRect();
          return (
            rect.right > viewport.left &&
            rect.left < viewport.right &&
            rect.bottom > viewport.top &&
            rect.top < viewport.bottom
          );
        })
        .sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          if (aRect.top !== bRect.top) {
            return aRect.top - bRect.top;
          }
          return aRect.left - bRect.left;
        });

      let chosenInput: HTMLInputElement | null = null;
      for (const section of visibleSections) {
        const input = section.querySelector<HTMLInputElement>(
          'input[placeholder="Filter"]',
        );
        if (input) {
          chosenInput = input;
          break;
        }
      }

      if (!(chosenInput instanceof HTMLInputElement)) {
        throw new Error("Failed to locate a section-level Filter input.");
      }

      chosenInput.focus();
      const valueDescriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      );
      const setValue = valueDescriptor?.set;
      if (!setValue) {
        throw new Error("Missing HTMLInputElement.value setter.");
      }

      const text = "abcdefghi";
      let value = "";
      const samples: number[] = [];
      for (const char of text) {
        value += char;
        const t0 = performance.now();
        setValue.call(chosenInput, value);
        chosenInput.dispatchEvent(new Event("input", { bubbles: true }));
        const t1 = await nextFrame();
        samples.push(t1 - t0);
      }

      setValue.call(chosenInput, "");
      chosenInput.dispatchEvent(new Event("input", { bubbles: true }));
      await nextFrame();

      return {
        avgFrameMs: Number(average(samples).toFixed(2)),
        p95FrameMs: Number(medianP95(samples).toFixed(2)),
        worstFrameMs: Number(Math.max(...samples).toFixed(2)),
        samples: samples.length,
      };
    };

    const measureDomStats = (): DomStats => {
      const viewport = viewportRect();
      const viewportContainer = document.querySelector(".react-flow__viewport");
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-section-id]"),
      );
      const visibleSectionCount = sections.filter((section) => {
        const rect = section.getBoundingClientRect();
        return (
          rect.right > viewport.left &&
          rect.left < viewport.right &&
          rect.bottom > viewport.top &&
          rect.top < viewport.bottom
        );
      }).length;

      return {
        totalNodes: document.querySelectorAll("*").length,
        topLevelSectionCount: document.querySelectorAll(".react-flow__node")
          .length,
        visibleSectionCount,
        iconLikeNodeCount: document.querySelectorAll(
          'svg, i[class^="gg-"], i[class*=" gg-"]',
        ).length,
        viewportLayerSplitEnabled:
          viewportContainer?.getAttribute("data-viewport-layer-split") ===
          "true",
      };
    };

    const throughput = await measureThroughput();
    const startHitch = await measureStartHitch();
    const stopHitch = await measureStopHitch();
    const typing = await measureTypingLatency();
    const dom = measureDomStats();
    return { throughput, startHitch, stopHitch, typing, dom };
  });

  expect(metrics.dom.topLevelSectionCount).toBeGreaterThanOrEqual(40);
  expect(metrics.dom.visibleSectionCount).toBeGreaterThan(0);
  expect(metrics.throughput.panFps).toBeGreaterThan(5);
  expect(metrics.throughput.zoomFps).toBeGreaterThan(5);
  expect(metrics.typing.samples).toBeGreaterThan(0);

  const metricsJson = JSON.stringify(metrics, null, 2);
  await testInfo.attach("settings-all-settings-perf-baseline.json", {
    body: metricsJson,
    contentType: "application/json",
  });
  console.info(
    `[settings-all-settings-perf-baseline] ${JSON.stringify(metrics)}`,
  );
});
