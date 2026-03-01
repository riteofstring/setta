import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const VIEWPORT_LAYER_SPLIT_KEY = "setta.viewportLayerSplit.enabled";
const VIEWPORT_SHELL_MODE_KEY = "setta.viewportShellMode.enabled";
const VIEWPORT_MOTION_SHELL_KEY = "setta.viewportMotionShell.enabled";

type HitchStats = {
  avgMs: number;
  p95Ms: number;
  worstMs: number;
};

type ScenarioMetrics = {
  throughput: {
    panFps: number;
    zoomFps: number;
  };
  startHitch: HitchStats;
  stopHitch: HitchStats;
  postPanEdit: {
    inputReady: boolean;
    valueCommitted: boolean;
    inputHitTestMs: number;
  };
  dom: {
    topLevelSectionCount: number;
    visibleSectionCount: number;
    viewportMotionShellEnabled: boolean;
    viewportMotionShellActive: boolean;
  };
};

type GuardrailMetrics = {
  control: ScenarioMetrics;
  motionShell: ScenarioMetrics;
  deltas: {
    panMultiplier: number;
    zoomMultiplier: number;
    startP95DeltaMs: number;
    stopP95DeltaMs: number;
  };
};

type SettingsGuardrailConfig = {
  tabName: string;
  minNodeCount: number;
  minTopLevelSectionCount: number;
  minVisibleSectionCount: number;
  visibleSectionParityTolerance: number;
  minPanMultiplier: number;
  minZoomMultiplier: number;
  minMotionPanFps: number;
  minMotionZoomFps: number;
  maxStartHitchP95Ms: number;
  maxStopHitchP95Ms: number;
  maxStartP95DeltaMs: number;
  maxStopP95DeltaMs: number;
  maxPostPanInputHitTestMs: number;
  attachmentName: string;
  logPrefix: string;
};

async function setViewportFlags({
  page,
  motionShellEnabled,
}: {
  page: Page;
  motionShellEnabled: boolean;
}): Promise<void> {
  await page.evaluate(
    ({ layerSplitKey, shellModeKey, motionShellKey, motionShellValue }) => {
      window.localStorage.setItem(layerSplitKey, "0");
      window.localStorage.setItem(shellModeKey, "0");
      window.localStorage.setItem(motionShellKey, motionShellValue);
    },
    {
      layerSplitKey: VIEWPORT_LAYER_SPLIT_KEY,
      shellModeKey: VIEWPORT_SHELL_MODE_KEY,
      motionShellKey: VIEWPORT_MOTION_SHELL_KEY,
      motionShellValue: motionShellEnabled ? "1" : "0",
    },
  );
}

async function openSettingsViewMode({
  page,
  tabName,
  minNodeCount,
}: {
  page: Page;
  tabName: string;
  minNodeCount: number;
}): Promise<void> {
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const tab = page.getByRole("button", {
    name: tabName,
    exact: true,
  });
  await expect(tab).toBeVisible();
  await tab.click();

  await page.waitForFunction(
    (count) => document.querySelectorAll(".react-flow__node").length >= count,
    minNodeCount,
  );

  const fitViewButton = page.getByRole("button", { name: "fit view" });
  await expect(fitViewButton).toBeVisible();
  await fitViewButton.click();
  await page.waitForTimeout(200);
}

async function collectScenarioMetrics(page: Page): Promise<ScenarioMetrics> {
  return page.evaluate(async (): Promise<ScenarioMetrics> => {
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const nextFrame = (): Promise<number> =>
      new Promise((resolve) =>
        requestAnimationFrame(() => resolve(performance.now())),
      );

    const renderer = document.querySelector(".react-flow__renderer");
    const fitButton = document.querySelector('button[aria-label="fit view"]');
    const viewportContainer = document.querySelector(".react-flow__viewport");
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

    const findVisibleFilterInput = (): HTMLInputElement => {
      const bounds = viewportRect();
      const visibleSections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-section-id]"),
      )
        .filter((section) => {
          const rect = section.getBoundingClientRect();
          return (
            rect.right > bounds.left &&
            rect.left < bounds.right &&
            rect.bottom > bounds.top &&
            rect.top < bounds.bottom
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

      for (const section of visibleSections) {
        const input = section.querySelector<HTMLInputElement>(
          'input[placeholder="Filter"]',
        );
        if (input instanceof HTMLInputElement) {
          return input;
        }
      }

      throw new Error("Failed to locate a visible section-level Filter input.");
    };

    const measureThroughput = async (): Promise<{
      panFps: number;
      zoomFps: number;
    }> => {
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

      return {
        panFps: Number(((panFrames * 1000) / panElapsed).toFixed(1)),
        zoomFps: Number(((zoomFrames * 1000) / zoomElapsed).toFixed(1)),
      };
    };

    const measureStartHitch = async (): Promise<HitchStats> => {
      const samples: number[] = [];
      for (let trial = 0; trial < 18; trial += 1) {
        await resetView();
        const t0 = performance.now();
        dispatchPanWheel(trial);
        const t1 = await nextFrame();
        samples.push(t1 - t0);
      }
      return {
        avgMs: Number(average(samples).toFixed(2)),
        p95Ms: Number(percentile95(samples).toFixed(2)),
        worstMs: Number(Math.max(...samples).toFixed(2)),
      };
    };

    const measureStopHitch = async (): Promise<HitchStats> => {
      const samples: number[] = [];
      for (let trial = 0; trial < 14; trial += 1) {
        await resetView();
        for (let frame = 0; frame < 14; frame += 1) {
          dispatchPanWheel(frame + trial);
          await nextFrame();
        }
        const t0 = performance.now();
        const t1 = await nextFrame();
        samples.push(t1 - t0);
      }
      return {
        avgMs: Number(average(samples).toFixed(2)),
        p95Ms: Number(percentile95(samples).toFixed(2)),
        worstMs: Number(Math.max(...samples).toFixed(2)),
      };
    };

    const measurePostPanEdit = async (): Promise<{
      inputReady: boolean;
      valueCommitted: boolean;
      inputHitTestMs: number;
    }> => {
      await resetView();
      const input = findVisibleFilterInput();

      const isInputAtPoint = (): boolean => {
        const rect = input.getBoundingClientRect();
        const x = rect.left + rect.width * 0.5;
        const y = rect.top + rect.height * 0.5;
        const element = document.elementFromPoint(x, y);
        if (!(element instanceof Element)) {
          return false;
        }
        return (
          element === input ||
          input.contains(element) ||
          element.closest('input[placeholder="Filter"]') === input
        );
      };

      for (let frame = 0; frame < 14; frame += 1) {
        dispatchPanWheel(frame);
        await nextFrame();
      }

      const start = performance.now();
      let hitTestDelay = -1;
      while (performance.now() - start < 700) {
        if (isInputAtPoint()) {
          hitTestDelay = performance.now() - start;
          break;
        }
        await nextFrame();
      }

      const valueDescriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      );
      const setValue = valueDescriptor?.set;
      if (!setValue) {
        throw new Error("Missing HTMLInputElement.value setter.");
      }

      input.focus();
      setValue.call(input, "x");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await nextFrame();
      const valueCommitted = input.value === "x";

      setValue.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await nextFrame();

      return {
        inputReady: hitTestDelay >= 0,
        valueCommitted,
        inputHitTestMs:
          hitTestDelay >= 0 ? Number(hitTestDelay.toFixed(2)) : 999,
      };
    };

    const measureDom = async (): Promise<{
      topLevelSectionCount: number;
      visibleSectionCount: number;
      viewportMotionShellEnabled: boolean;
      viewportMotionShellActive: boolean;
    }> => {
      await resetView();
      await sleep(260);

      const bounds = viewportRect();
      const visibleSectionCount = Array.from(
        document.querySelectorAll<HTMLElement>("[data-section-id]"),
      ).filter((section) => {
        const rect = section.getBoundingClientRect();
        return (
          rect.right > bounds.left &&
          rect.left < bounds.right &&
          rect.bottom > bounds.top &&
          rect.top < bounds.bottom
        );
      }).length;

      return {
        topLevelSectionCount:
          document.querySelectorAll(".react-flow__node").length,
        visibleSectionCount,
        viewportMotionShellEnabled:
          viewportContainer?.getAttribute(
            "data-viewport-motion-shell-enabled",
          ) === "true",
        viewportMotionShellActive:
          viewportContainer?.getAttribute(
            "data-viewport-motion-shell-active",
          ) === "true",
      };
    };

    const throughput = await measureThroughput();
    const startHitch = await measureStartHitch();
    const stopHitch = await measureStopHitch();
    const postPanEdit = await measurePostPanEdit();
    const dom = await measureDom();

    return { throughput, startHitch, stopHitch, postPanEdit, dom };
  });
}

async function runSettingsGuardrail({
  page,
  testInfo,
  config,
}: {
  page: Page;
  testInfo: TestInfo;
  config: SettingsGuardrailConfig;
}): Promise<void> {
  test.slow();

  await setViewportFlags({ page, motionShellEnabled: false });
  await openSettingsViewMode({
    page,
    tabName: config.tabName,
    minNodeCount: config.minNodeCount,
  });
  const control = await collectScenarioMetrics(page);

  await setViewportFlags({ page, motionShellEnabled: true });
  await openSettingsViewMode({
    page,
    tabName: config.tabName,
    minNodeCount: config.minNodeCount,
  });
  const motionShell = await collectScenarioMetrics(page);

  const panMultiplier =
    motionShell.throughput.panFps / Math.max(control.throughput.panFps, 0.1);
  const zoomMultiplier =
    motionShell.throughput.zoomFps / Math.max(control.throughput.zoomFps, 0.1);
  const startP95DeltaMs =
    motionShell.startHitch.p95Ms - control.startHitch.p95Ms;
  const stopP95DeltaMs = motionShell.stopHitch.p95Ms - control.stopHitch.p95Ms;

  expect(control.dom.viewportMotionShellEnabled).toBe(false);
  expect(motionShell.dom.viewportMotionShellEnabled).toBe(true);
  expect(control.dom.viewportMotionShellActive).toBe(false);
  expect(motionShell.dom.viewportMotionShellActive).toBe(false);

  expect(control.dom.topLevelSectionCount).toBeGreaterThanOrEqual(
    config.minTopLevelSectionCount,
  );
  expect(motionShell.dom.topLevelSectionCount).toBeGreaterThanOrEqual(
    config.minTopLevelSectionCount,
  );
  expect(control.dom.visibleSectionCount).toBeGreaterThanOrEqual(
    config.minVisibleSectionCount,
  );
  expect(motionShell.dom.visibleSectionCount).toBeGreaterThanOrEqual(
    config.minVisibleSectionCount,
  );
  expect(motionShell.dom.visibleSectionCount).toBeGreaterThanOrEqual(
    control.dom.visibleSectionCount - config.visibleSectionParityTolerance,
  );
  expect(motionShell.dom.visibleSectionCount).toBeLessThanOrEqual(
    control.dom.visibleSectionCount + config.visibleSectionParityTolerance,
  );

  expect(panMultiplier).toBeGreaterThanOrEqual(config.minPanMultiplier);
  expect(zoomMultiplier).toBeGreaterThanOrEqual(config.minZoomMultiplier);
  expect(motionShell.throughput.panFps).toBeGreaterThan(config.minMotionPanFps);
  expect(motionShell.throughput.zoomFps).toBeGreaterThan(
    config.minMotionZoomFps,
  );

  expect(motionShell.startHitch.p95Ms).toBeLessThan(config.maxStartHitchP95Ms);
  expect(motionShell.stopHitch.p95Ms).toBeLessThan(config.maxStopHitchP95Ms);
  expect(startP95DeltaMs).toBeLessThan(config.maxStartP95DeltaMs);
  expect(stopP95DeltaMs).toBeLessThan(config.maxStopP95DeltaMs);

  expect(control.postPanEdit.inputReady).toBe(true);
  expect(motionShell.postPanEdit.inputReady).toBe(true);
  expect(control.postPanEdit.valueCommitted).toBe(true);
  expect(motionShell.postPanEdit.valueCommitted).toBe(true);
  expect(motionShell.postPanEdit.inputHitTestMs).toBeLessThan(
    config.maxPostPanInputHitTestMs,
  );

  const metrics: GuardrailMetrics = {
    control,
    motionShell,
    deltas: {
      panMultiplier: Number(panMultiplier.toFixed(2)),
      zoomMultiplier: Number(zoomMultiplier.toFixed(2)),
      startP95DeltaMs: Number(startP95DeltaMs.toFixed(2)),
      stopP95DeltaMs: Number(stopP95DeltaMs.toFixed(2)),
    },
  };

  const metricsJson = JSON.stringify(metrics, null, 2);
  await testInfo.attach(config.attachmentName, {
    body: metricsJson,
    contentType: "application/json",
  });
  console.info(`${config.logPrefix} ${JSON.stringify(metrics)}`);
}

test("settings all-settings viewport-motion-shell guardrail", async ({
  page,
}, testInfo) => {
  await ensureAppReady(page);
  await runSettingsGuardrail({
    page,
    testInfo,
    config: {
      tabName: "All Settings",
      minNodeCount: 42,
      minTopLevelSectionCount: 40,
      minVisibleSectionCount: 30,
      visibleSectionParityTolerance: 2,
      minPanMultiplier: 2,
      minZoomMultiplier: 1.8,
      minMotionPanFps: 70,
      minMotionZoomFps: 70,
      maxStartHitchP95Ms: 12,
      maxStopHitchP95Ms: 14,
      maxStartP95DeltaMs: 8,
      maxStopP95DeltaMs: 8,
      maxPostPanInputHitTestMs: 260,
      attachmentName:
        "settings-all-settings-viewport-motion-shell-guardrail.json",
      logPrefix: "[settings-all-settings-viewport-motion-shell-guardrail]",
    },
  });
});

test("settings param-defaults viewport-motion-shell guardrail", async ({
  page,
}, testInfo) => {
  await ensureAppReady(page);
  await runSettingsGuardrail({
    page,
    testInfo,
    config: {
      tabName: "Param Defaults",
      minNodeCount: 13,
      minTopLevelSectionCount: 12,
      minVisibleSectionCount: 10,
      visibleSectionParityTolerance: 2,
      minPanMultiplier: 0.95,
      minZoomMultiplier: 0.95,
      minMotionPanFps: 40,
      minMotionZoomFps: 40,
      maxStartHitchP95Ms: 12,
      maxStopHitchP95Ms: 14,
      maxStartP95DeltaMs: 8,
      maxStopP95DeltaMs: 8,
      maxPostPanInputHitTestMs: 260,
      attachmentName:
        "settings-param-defaults-viewport-motion-shell-guardrail.json",
      logPrefix: "[settings-param-defaults-viewport-motion-shell-guardrail]",
    },
  });
});
