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
  "param-structure-shell",
  "param-chrome-shell",
  "param-container-shell",
  "param-input-shell",
  "non-text-widgets",
  "full",
] as const;

type StageMetrics = {
  domCount: number;
  headerCount: number;
  shellCount: number;
  staticRowCount: number;
  paramContainerCount: number;
  lightLabelCount: number;
  paramValueShellCount: number;
  paramUiShellCount: number;
  textWidgetShellCount: number;
  textInputDummyCount: number;
  resizeHandleCount: number;
  staticRowModeCount: number;
  sortableRowModeCount: number;
};

test("all settings benchmark stages progressively restore section complexity", async ({
  page,
}) => {
  await ensureAppReady(page);

  const metricsByStage = new Map<(typeof STAGES)[number], StageMetrics>();

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
  expect(metricsByStage.get("section-body-shell")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("section-body-shell")?.paramContainerCount).toBe(0);

  expect(
    metricsByStage.get("static-param-list")?.staticRowCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("static-param-list")?.paramContainerCount).toBe(0);

  expect(metricsByStage.get("param-structure-shell")?.staticRowCount).toBe(0);
  expect(
    metricsByStage.get("param-structure-shell")?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-structure-shell")?.lightLabelCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-structure-shell")?.paramValueShellCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-structure-shell")?.resizeHandleCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("param-structure-shell")?.staticRowModeCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-structure-shell")?.sortableRowModeCount,
  ).toBe(0);

  expect(metricsByStage.get("param-chrome-shell")?.staticRowCount).toBe(0);
  expect(
    metricsByStage.get("param-chrome-shell")?.lightLabelCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-chrome-shell")?.paramValueShellCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-chrome-shell")?.resizeHandleCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-chrome-shell")?.staticRowModeCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-chrome-shell")?.sortableRowModeCount).toBe(
    0,
  );

  expect(metricsByStage.get("param-container-shell")?.staticRowCount).toBe(0);
  expect(
    metricsByStage.get("param-container-shell")?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-container-shell")?.lightLabelCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-container-shell")?.paramValueShellCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-container-shell")?.resizeHandleCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-container-shell")?.paramUiShellCount).toBe(
    0,
  );
  expect(metricsByStage.get("param-container-shell")?.staticRowModeCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("param-container-shell")?.sortableRowModeCount,
  ).toBeGreaterThan(0);

  expect(
    metricsByStage.get("param-input-shell")?.lightLabelCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-input-shell")?.paramValueShellCount).toBe(0);
  expect(
    metricsByStage.get("param-input-shell")?.paramUiShellCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-input-shell")?.textWidgetShellCount).toBe(0);

  expect(
    metricsByStage.get("non-text-widgets")?.lightLabelCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("non-text-widgets")?.paramUiShellCount).toBe(0);
  expect(
    metricsByStage.get("non-text-widgets")?.textWidgetShellCount,
  ).toBeGreaterThan(0);

  expect(metricsByStage.get("full")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("full")?.paramContainerCount).toBeGreaterThan(0);
  expect(metricsByStage.get("full")?.lightLabelCount).toBe(0);
  expect(metricsByStage.get("full")?.paramValueShellCount).toBe(0);
  expect(metricsByStage.get("full")?.paramUiShellCount).toBe(0);
  expect(metricsByStage.get("full")?.textWidgetShellCount).toBe(0);
  expect(metricsByStage.get("full")?.textInputDummyCount).toBeGreaterThan(0);

  expect(metricsByStage.get("frame-only")?.domCount).toBeLessThan(
    metricsByStage.get("header-only")?.domCount ?? 0,
  );
  expect(metricsByStage.get("header-only")?.domCount).toBeLessThan(
    metricsByStage.get("section-body-shell")?.domCount ?? 0,
  );
  expect(metricsByStage.get("section-body-shell")?.domCount).toBeLessThan(
    metricsByStage.get("static-param-list")?.domCount ?? 0,
  );
  expect(metricsByStage.get("static-param-list")?.domCount).toBeLessThan(
    metricsByStage.get("param-structure-shell")?.domCount ?? 0,
  );
  expect(metricsByStage.get("param-structure-shell")?.domCount).toBeLessThan(
    metricsByStage.get("param-chrome-shell")?.domCount ?? 0,
  );
  expect(
    metricsByStage.get("param-chrome-shell")?.domCount,
  ).toBeLessThanOrEqual(
    metricsByStage.get("param-container-shell")?.domCount ?? 0,
  );
  expect(
    metricsByStage.get("param-container-shell")?.domCount,
  ).toBeLessThanOrEqual(metricsByStage.get("param-input-shell")?.domCount ?? 0);
  expect(metricsByStage.get("param-input-shell")?.domCount).toBeLessThanOrEqual(
    metricsByStage.get("non-text-widgets")?.domCount ?? 0,
  );
  expect(metricsByStage.get("non-text-widgets")?.domCount).toBeLessThan(
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
      staticRowCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-static-param-row]",
      ).length,
      paramContainerCount: flowRoot.querySelectorAll('[id^="ParamContainer-"]')
        .length,
      lightLabelCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-light-label]",
      ).length,
      paramValueShellCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-param-value-shell]",
      ).length,
      paramUiShellCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-widget-shell="param-ui-shell"]',
      ).length,
      textWidgetShellCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-widget-shell="text-family"]',
      ).length,
      textInputDummyCount: flowRoot.querySelectorAll('[id$="-ParamInput"]')
        .length,
      resizeHandleCount: flowRoot.querySelectorAll("[data-param-resize-handle]")
        .length,
      staticRowModeCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-param-row-mode="static"]',
      ).length,
      sortableRowModeCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-param-row-mode="sortable"]',
      ).length,
    };
  });
}
