import { expect, test, type Page, type TestInfo } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

const READY_SELECTOR = ".react-flow__pane";
const VIEWPORT_LAYER_SPLIT_KEY = "setta.viewportLayerSplit.enabled";
const VIEWPORT_SHELL_MODE_KEY = "setta.viewportShellMode.enabled";
const VIEWPORT_MOTION_SHELL_KEY = "setta.viewportMotionShell.enabled";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

type HitchStats = {
  avgMs: number;
  p95Ms: number;
  worstMs: number;
};

type PluginScenarioMetrics = {
  throughput: {
    panFps: number;
    zoomFps: number;
  };
  startHitch: HitchStats;
  stopHitch: HitchStats;
  postPanInteraction: {
    buttonReady: boolean;
    sectionRenderAdvanced: boolean;
    buttonHitTestMs: number;
  };
  dom: {
    topLevelSectionCount: number;
    fixtureCardCount: number;
    visibleFixtureCardCount: number;
    viewportMotionShellEnabled: boolean;
    viewportMotionShellActive: boolean;
  };
};

type PluginGuardrailMetrics = {
  control: PluginScenarioMetrics;
  motionShell: PluginScenarioMetrics;
  deltas: {
    panMultiplier: number;
    zoomMultiplier: number;
    startP95DeltaMs: number;
    stopP95DeltaMs: number;
  };
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

async function waitForFixtureCards({
  page,
  minCount,
}: {
  page: Page;
  minCount: number;
}): Promise<void> {
  await expect
    .poll(
      async () => page.locator("[data-testid='fixture-plugin-card']").count(),
      { timeout: 20000 },
    )
    .toBeGreaterThanOrEqual(minCount);
}

async function collectPluginScenarioMetrics(
  page: Page,
): Promise<PluginScenarioMetrics> {
  return page.evaluate(async (): Promise<PluginScenarioMetrics> => {
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

    const findVisibleBoostButton = (): {
      button: HTMLButtonElement;
      sectionId: string;
    } => {
      const bounds = viewportRect();
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-testid='fixture-plugin-card']",
        ),
      )
        .filter((card) => {
          const rect = card.getBoundingClientRect();
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

      for (const card of cards) {
        const button = card.querySelector<HTMLButtonElement>(
          "button[data-testid='fixture-card-boost']",
        );
        if (!(button instanceof HTMLButtonElement)) {
          continue;
        }
        const sectionHost = card.closest<HTMLElement>(
          "[data-fixture-section-id]",
        );
        const sectionId = sectionHost?.getAttribute("data-fixture-section-id");
        if (!sectionId) {
          continue;
        }
        return { button, sectionId };
      }

      throw new Error("Failed to locate a visible fixture card button.");
    };

    const readRenderCountForSection = (sectionId: string): number =>
      Number(
        (window as { __settaFixtureRenderBySectionId?: Record<string, number> })
          .__settaFixtureRenderBySectionId?.[sectionId] || 0,
      );

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

    const measurePostPanInteraction = async (): Promise<{
      buttonReady: boolean;
      sectionRenderAdvanced: boolean;
      buttonHitTestMs: number;
    }> => {
      await resetView();

      for (let frame = 0; frame < 14; frame += 1) {
        dispatchPanWheel(frame);
        await nextFrame();
      }

      const start = performance.now();
      let hitTestDelay = -1;
      let button: HTMLButtonElement | null = null;
      let sectionId: string | null = null;
      while (performance.now() - start < 900) {
        try {
          const nextTarget = findVisibleBoostButton();
          button = nextTarget.button;
          sectionId = nextTarget.sectionId;
          hitTestDelay = performance.now() - start;
          break;
        } catch {
          // Continue polling while movement settles.
        }
        await nextFrame();
      }

      let sectionRenderAdvanced = false;
      if (button && sectionId) {
        const before = readRenderCountForSection(sectionId);
        button.click();
        const waitStart = performance.now();
        while (performance.now() - waitStart < 1500) {
          await nextFrame();
          if (readRenderCountForSection(sectionId) > before) {
            sectionRenderAdvanced = true;
            break;
          }
        }
      }

      return {
        buttonReady: hitTestDelay >= 0,
        sectionRenderAdvanced,
        buttonHitTestMs:
          hitTestDelay >= 0 ? Number(hitTestDelay.toFixed(2)) : 999,
      };
    };

    const measureDom = async (): Promise<{
      topLevelSectionCount: number;
      fixtureCardCount: number;
      visibleFixtureCardCount: number;
      viewportMotionShellEnabled: boolean;
      viewportMotionShellActive: boolean;
    }> => {
      await resetView();
      await sleep(260);
      const bounds = viewportRect();
      const fixtureCards = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-testid='fixture-plugin-card']",
        ),
      );
      const visibleFixtureCardCount = fixtureCards.filter((card) => {
        const rect = card.getBoundingClientRect();
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
        fixtureCardCount: fixtureCards.length,
        visibleFixtureCardCount,
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
    const postPanInteraction = await measurePostPanInteraction();
    const dom = await measureDom();
    return { throughput, startHitch, stopHitch, postPanInteraction, dom };
  });
}

async function runPluginGuardrail({
  page,
  testInfo,
}: {
  page: Page;
  testInfo: TestInfo;
}): Promise<void> {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);

  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);

    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error(
        "Unable to resolve viewport bounds for plugin placement.",
      );
    }

    const totalSections = 100;
    const columns = 10;
    const rows = 10;
    for (let index = 0; index < totalSections; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns) % rows;
      const created = await postBackend<CreateTopLevelSectionResponse>(
        page,
        "/createTopLevelSection",
        {
          projectConfigId: projectContext.projectConfigId,
          implType: "Plugin",
          controlCodeObjType: null,
          implOverrides: {
            type: "Plugin",
            pluginId: "setta-fixture-frontend",
            kind: "fixture-card",
            data: { text: `motion-shell-${index}` },
          },
          position: {
            x: viewportBounds.x + ((column + 0.5) * viewportBounds.w) / columns,
            y: viewportBounds.y + ((row + 0.5) * viewportBounds.h) / rows,
          },
          topLevelSections: null,
          viewportBounds,
        },
      );
      if (!created?.sectionId) {
        throw new Error("Missing created fixture section id.");
      }
    }

    await waitForFixtureCards({ page, minCount: 80 });

    await setViewportFlags({ page, motionShellEnabled: false });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await waitForFixtureCards({ page, minCount: 80 });
    const control = await collectPluginScenarioMetrics(page);

    await setViewportFlags({ page, motionShellEnabled: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await waitForFixtureCards({ page, minCount: 80 });
    const motionShell = await collectPluginScenarioMetrics(page);

    const panMultiplier =
      motionShell.throughput.panFps / Math.max(control.throughput.panFps, 0.1);
    const zoomMultiplier =
      motionShell.throughput.zoomFps /
      Math.max(control.throughput.zoomFps, 0.1);
    const startP95DeltaMs =
      motionShell.startHitch.p95Ms - control.startHitch.p95Ms;
    const stopP95DeltaMs =
      motionShell.stopHitch.p95Ms - control.stopHitch.p95Ms;

    expect(control.dom.viewportMotionShellEnabled).toBe(false);
    expect(motionShell.dom.viewportMotionShellEnabled).toBe(true);
    expect(control.dom.viewportMotionShellActive).toBe(false);
    expect(motionShell.dom.viewportMotionShellActive).toBe(false);

    expect(control.dom.topLevelSectionCount).toBeGreaterThanOrEqual(90);
    expect(motionShell.dom.topLevelSectionCount).toBeGreaterThanOrEqual(90);
    expect(control.dom.fixtureCardCount).toBeGreaterThanOrEqual(80);
    expect(motionShell.dom.fixtureCardCount).toBeGreaterThanOrEqual(80);
    expect(control.dom.visibleFixtureCardCount).toBeGreaterThanOrEqual(70);
    expect(motionShell.dom.visibleFixtureCardCount).toBeGreaterThanOrEqual(70);
    expect(motionShell.dom.visibleFixtureCardCount).toBeGreaterThanOrEqual(
      control.dom.visibleFixtureCardCount - 6,
    );
    expect(motionShell.dom.visibleFixtureCardCount).toBeLessThanOrEqual(
      control.dom.visibleFixtureCardCount + 6,
    );

    expect(panMultiplier).toBeGreaterThanOrEqual(1.2);
    expect(zoomMultiplier).toBeGreaterThanOrEqual(1.2);
    expect(motionShell.throughput.panFps).toBeGreaterThan(45);
    expect(motionShell.throughput.zoomFps).toBeGreaterThan(45);

    expect(motionShell.startHitch.p95Ms).toBeLessThan(14);
    expect(motionShell.stopHitch.p95Ms).toBeLessThan(16);
    expect(startP95DeltaMs).toBeLessThan(8);
    expect(stopP95DeltaMs).toBeLessThan(8);

    expect(control.postPanInteraction.buttonReady).toBe(true);
    expect(motionShell.postPanInteraction.buttonReady).toBe(true);
    expect(control.postPanInteraction.sectionRenderAdvanced).toBe(true);
    expect(motionShell.postPanInteraction.sectionRenderAdvanced).toBe(true);
    expect(motionShell.postPanInteraction.buttonHitTestMs).toBeLessThan(320);

    const metrics: PluginGuardrailMetrics = {
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
    await testInfo.attach(
      "plugin-sections-viewport-motion-shell-guardrail.json",
      {
        body: metricsJson,
        contentType: "application/json",
      },
    );
    console.info(
      `[plugin-sections-viewport-motion-shell-guardrail] ${JSON.stringify(metrics)}`,
    );
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
}

test("plugin sections large-dom viewport-motion-shell guardrail", async ({
  page,
}, testInfo) => {
  test.slow();
  await runPluginGuardrail({ page, testInfo });
});
