import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL);
const READY_SELECTOR = ".react-flow__pane";
const QUERY_PARAM = "settingsBenchmarkStage";

const STAGES = [
  "frame-only",
  "header-only",
  "section-body-shell",
  "static-param-list",
  "full",
] as const;

type StageMetrics = {
  domCount: number;
  headerCount: number;
  shellCount: number;
  sceneCanvasCount: number;
  sceneRowCount: number;
  staticRowCount: number;
  paramContainerCount: number;
};

test("all settings benchmark stages progressively restore section complexity", async ({
  page,
}) => {
  await ensureAppReady(page);

  const metricsByStage = new Map<(typeof STAGES)[number], StageMetrics>();

  // Walk each benchmark stage in order so the assertions can confirm the DOM
  // ramps back up as the real Settings param tree is restored.
  for (const stage of STAGES) {
    await openBenchmarkStage(page, stage);
    metricsByStage.set(stage, await collectStageMetrics(page));
  }

  expect(metricsByStage.get("frame-only")?.headerCount).toBe(0);
  expect(metricsByStage.get("frame-only")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("frame-only")?.paramContainerCount).toBe(0);

  expect(metricsByStage.get("header-only")?.headerCount).toBeGreaterThan(0);
  expect(metricsByStage.get("header-only")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("header-only")?.paramContainerCount).toBe(0);

  expect(metricsByStage.get("section-body-shell")?.shellCount).toBeGreaterThan(
    0,
  );
  expect(metricsByStage.get("section-body-shell")?.sceneCanvasCount).toBe(0);
  expect(metricsByStage.get("section-body-shell")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("section-body-shell")?.paramContainerCount).toBe(0);

  expect(
    metricsByStage.get("static-param-list")?.sceneCanvasCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("static-param-list")?.sceneRowCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("static-param-list")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("static-param-list")?.paramContainerCount).toBe(0);

  expect(metricsByStage.get("full")?.sceneCanvasCount).toBe(0);
  expect(metricsByStage.get("full")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("full")?.paramContainerCount).toBeGreaterThan(0);

  expect(metricsByStage.get("frame-only")?.domCount).toBeLessThan(
    metricsByStage.get("header-only")?.domCount ?? 0,
  );
  expect(metricsByStage.get("header-only")?.domCount).toBeLessThan(
    metricsByStage.get("section-body-shell")?.domCount ?? 0,
  );
  expect(metricsByStage.get("static-param-list")?.domCount).toBeLessThan(
    metricsByStage.get("full")?.domCount ?? 0,
  );
});

async function openBenchmarkStage(
  page: Page,
  stage: (typeof STAGES)[number],
): Promise<void> {
  const url = new URL(SETTINGS_URL);
  url.searchParams.set(QUERY_PARAM, stage);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();

  await expect(page.locator(".react-flow")).toHaveAttribute(
    "data-settings-benchmark-stage",
    stage,
  );
  await page.waitForFunction(
    (expectedStage) =>
      document
        .querySelector(".react-flow")
        ?.getAttribute("data-settings-benchmark-stage") === expectedStage,
    stage,
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node").length > 0,
  );
}

async function collectStageMetrics(page: Page): Promise<StageMetrics> {
  return page.evaluate(() => {
    const flowRoot = document.querySelector(".react-flow");
    if (!flowRoot) {
      throw new Error("Missing react flow root.");
    }

    return {
      domCount: flowRoot.querySelectorAll("*").length,
      headerCount: flowRoot.querySelectorAll("header.section-title").length,
      shellCount: flowRoot.querySelectorAll("[data-settings-benchmark-shell]")
        .length,
      sceneCanvasCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-scene='pixi'] canvas",
      ).length,
      sceneRowCount: Array.from(
        flowRoot.querySelectorAll("[data-settings-benchmark-scene='pixi']"),
      ).reduce((rowCount, element) => {
        return (
          rowCount +
          Number.parseInt(
            element.getAttribute("data-settings-benchmark-scene-row-count") ??
              "0",
            10,
          )
        );
      }, 0),
      staticRowCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-static-param-row]",
      ).length,
      paramContainerCount: flowRoot.querySelectorAll('[id^="ParamContainer-"]')
        .length,
    };
  });
}
