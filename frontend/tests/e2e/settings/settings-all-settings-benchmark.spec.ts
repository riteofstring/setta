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
  "group-container-static-list",
  "param-flat-shell",
  "param-simple-grid-shell",
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
  groupContainerCount: number;
  staticRowCount: number;
  groupContainerStaticListCount: number;
  paramContainerCount: number;
  flatParamRowCount: number;
  flatParamChildrenCount: number;
  simpleGridParamRowCount: number;
  simpleGridChildrenCount: number;
  lightLabelCount: number;
  paramValueShellCount: number;
  paramUiShellCount: number;
  textWidgetShellCount: number;
  textInputDummyCount: number;
  resizeHandleCount: number;
  flatRowModeCount: number;
  simpleGridRowModeCount: number;
  staticRowModeCount: number;
  sortableRowModeCount: number;
  sampleParamRowCount: number;
  sampleParamRowMinWidth: number;
  sampleParamRowNarrowCount: number;
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
  expect(metricsByStage.get("static-param-list")?.groupContainerCount).toBe(0);
  expect(metricsByStage.get("static-param-list")?.paramContainerCount).toBe(0);

  expect(
    metricsByStage.get("group-container-static-list")?.groupContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("group-container-static-list")?.staticRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("group-container-static-list")
      ?.groupContainerStaticListCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("group-container-static-list")?.paramContainerCount,
  ).toBe(0);
  expect(
    metricsByStage.get("group-container-static-list")?.flatParamRowCount,
  ).toBe(0);

  expect(metricsByStage.get("param-flat-shell")?.staticRowCount).toBe(0);
  expect(
    metricsByStage.get("param-flat-shell")?.groupContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-flat-shell")?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-flat-shell")?.flatParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-flat-shell")?.flatParamChildrenCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-flat-shell")?.lightLabelCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-flat-shell")?.paramValueShellCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-flat-shell")?.flatRowModeCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-flat-shell")?.staticRowModeCount).toBe(0);
  expect(metricsByStage.get("param-flat-shell")?.sortableRowModeCount).toBe(0);
  expect(metricsByStage.get("param-flat-shell")?.simpleGridRowModeCount).toBe(
    0,
  );

  expect(metricsByStage.get("param-simple-grid-shell")?.staticRowCount).toBe(0);
  expect(
    metricsByStage.get("param-simple-grid-shell")?.groupContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-simple-grid-shell")?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-simple-grid-shell")?.simpleGridParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-simple-grid-shell")?.simpleGridChildrenCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-simple-grid-shell")?.lightLabelCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-simple-grid-shell")?.paramValueShellCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-simple-grid-shell")?.simpleGridRowModeCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-simple-grid-shell")?.flatRowModeCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("param-simple-grid-shell")?.staticRowModeCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-simple-grid-shell")?.sortableRowModeCount,
  ).toBe(0);

  expect(metricsByStage.get("param-structure-shell")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("param-structure-shell")?.flatParamRowCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("param-structure-shell")?.simpleGridParamRowCount,
  ).toBe(0);
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
    metricsByStage.get("param-structure-shell")?.sampleParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-structure-shell")?.sampleParamRowMinWidth,
  ).toBeGreaterThan(250);
  expect(
    metricsByStage.get("param-structure-shell")?.sampleParamRowNarrowCount,
  ).toBe(0);
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
  expect(
    metricsByStage.get("param-container-shell")?.sampleParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-container-shell")?.sampleParamRowMinWidth,
  ).toBeGreaterThan(250);
  expect(
    metricsByStage.get("param-container-shell")?.sampleParamRowNarrowCount,
  ).toBe(0);
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
  expect(metricsByStage.get("full")?.sampleParamRowCount).toBeGreaterThan(0);
  expect(metricsByStage.get("full")?.sampleParamRowMinWidth).toBeGreaterThan(
    250,
  );
  expect(metricsByStage.get("full")?.sampleParamRowNarrowCount).toBe(0);

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
    metricsByStage.get("group-container-static-list")?.domCount ?? 0,
  );
  expect(
    metricsByStage.get("group-container-static-list")?.domCount,
  ).toBeLessThan(metricsByStage.get("param-flat-shell")?.domCount ?? 0);
  expect(
    metricsByStage.get("group-container-static-list")?.domCount,
  ).toBeLessThan(metricsByStage.get("param-simple-grid-shell")?.domCount ?? 0);
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
    const viewport = flowRoot.querySelector(".react-flow__viewport");
    const viewportTransform =
      viewport instanceof HTMLElement
        ? window.getComputedStyle(viewport).transform
        : "none";
    const viewportScale =
      viewportTransform !== "none"
        ? new DOMMatrixReadOnly(viewportTransform).m11 || 1
        : 1;
    const sampleWidths = Array.from(
      flowRoot.querySelectorAll('[data-param-row="true"]'),
    )
      .slice(0, 16)
      .map((row) => row.getBoundingClientRect().width / viewportScale)
      .filter((width) => Number.isFinite(width) && width > 0);

    return {
      domCount: flowRoot.querySelectorAll("*").length,
      headerCount: flowRoot.querySelectorAll("header.section-title").length,
      shellCount: flowRoot.querySelectorAll("[data-settings-benchmark-shell]")
        .length,
      groupContainerCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-group-container]",
      ).length,
      staticRowCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-static-param-row]",
      ).length,
      groupContainerStaticListCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-group-container-static-list]",
      ).length,
      paramContainerCount: flowRoot.querySelectorAll('[id^="ParamContainer-"]')
        .length,
      flatParamRowCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-flat-param-row]",
      ).length,
      flatParamChildrenCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-flat-param-children]",
      ).length,
      simpleGridParamRowCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-simple-grid-param-row]",
      ).length,
      simpleGridChildrenCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-simple-grid-children]",
      ).length,
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
      flatRowModeCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-param-row-mode="flat"]',
      ).length,
      simpleGridRowModeCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-param-row-mode="simple-grid"]',
      ).length,
      staticRowModeCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-param-row-mode="static"]',
      ).length,
      sortableRowModeCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-param-row-mode="sortable"]',
      ).length,
      sampleParamRowCount: sampleWidths.length,
      sampleParamRowMinWidth:
        sampleWidths.length > 0 ? Math.min(...sampleWidths) : 0,
      sampleParamRowNarrowCount: sampleWidths.filter((width) => width < 250)
        .length,
    };
  });
}
