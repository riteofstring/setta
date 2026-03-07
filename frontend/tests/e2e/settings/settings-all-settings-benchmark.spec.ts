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
  "param-top-level-flat-shell",
  "param-top-level-simple-grid-shell",
  "param-top-level-structure-shell",
  "param-parent-structure-shell",
  "param-structure-shell",
  "param-chrome-shell",
  "param-container-shell",
  "param-input-shell",
  "non-text-widgets",
  "code-widgets",
  "full",
  "full-section-snapdom",
  "full-section-opacity-hidden",
  "full-section-opacity-1pct",
  "full-section-snapdom-hidden-live",
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
  codeTextWidgetCount: number;
  textTextWidgetCount: number;
  textAreaTextWidgetCount: number;
  codeTextWidgetShellCount: number;
  textTextWidgetShellCount: number;
  textAreaTextWidgetShellCount: number;
  resizeHandleCount: number;
  parentRowCount: number;
  leafRowCount: number;
  topLevelRowCount: number;
  nestedRowCount: number;
  nestedChildSubtreeCount: number;
  suppressedParentRowCount: number;
  flatRowModeCount: number;
  simpleGridRowModeCount: number;
  staticRowModeCount: number;
  sortableRowModeCount: number;
  sampleParamRowCount: number;
  sampleParamRowMinWidth: number;
  sampleParamRowNarrowCount: number;
  sectionSnapdomCount: number;
  sectionSnapdomReadyCount: number;
  sectionSnapdomPendingCount: number;
  sectionSnapdomErrorCount: number;
  sectionSnapdomLiveActiveCount: number;
  sectionSnapdomPreviewCount: number;
  sectionOpacityHiddenCount: number;
  sectionOpacityHiddenHiddenCount: number;
  sectionOpacityHiddenVisibleActiveCount: number;
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

  expect(metricsByStage.get("param-top-level-flat-shell")?.staticRowCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.groupContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.flatParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.flatParamChildrenCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.parentRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.topLevelRowCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-top-level-flat-shell")?.nestedRowCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.nestedChildSubtreeCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.suppressedParentRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.sampleParamRowMinWidth,
  ).toBeGreaterThan(250);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.sampleParamRowNarrowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.flatRowModeCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.staticRowModeCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.sortableRowModeCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.simpleGridRowModeCount,
  ).toBe(0);

  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")?.staticRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.groupContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.simpleGridParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.simpleGridChildrenCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")?.parentRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")?.topLevelRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")?.nestedRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.nestedChildSubtreeCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.suppressedParentRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.sampleParamRowMinWidth,
  ).toBeGreaterThan(250);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.sampleParamRowNarrowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.simpleGridRowModeCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")?.staticRowModeCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")
      ?.sortableRowModeCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")?.flatRowModeCount,
  ).toBe(0);

  expect(
    metricsByStage.get("param-top-level-structure-shell")?.staticRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")?.parentRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")?.topLevelRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")?.nestedRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")
      ?.nestedChildSubtreeCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")
      ?.suppressedParentRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")
      ?.sampleParamRowMinWidth,
  ).toBeGreaterThan(250);
  expect(
    metricsByStage.get("param-top-level-structure-shell")
      ?.sampleParamRowNarrowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")?.staticRowModeCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")?.sortableRowModeCount,
  ).toBe(0);

  expect(
    metricsByStage.get("param-parent-structure-shell")?.staticRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-parent-structure-shell")?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-parent-structure-shell")?.parentRowCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("param-parent-structure-shell")?.leafRowCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("param-parent-structure-shell")?.nestedRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-parent-structure-shell")?.nestedChildSubtreeCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-parent-structure-shell")
      ?.suppressedParentRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-parent-structure-shell")?.sampleParamRowMinWidth,
  ).toBeGreaterThan(250);
  expect(
    metricsByStage.get("param-parent-structure-shell")
      ?.sampleParamRowNarrowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("param-parent-structure-shell")?.staticRowModeCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-parent-structure-shell")?.sortableRowModeCount,
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
    metricsByStage.get("param-structure-shell")?.parentRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-structure-shell")?.leafRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-structure-shell")?.nestedRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-structure-shell")?.nestedChildSubtreeCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("param-structure-shell")?.suppressedParentRowCount,
  ).toBe(0);
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
  expect(metricsByStage.get("non-text-widgets")?.codeTextWidgetCount).toBe(0);
  expect(metricsByStage.get("non-text-widgets")?.textTextWidgetCount).toBe(0);
  expect(metricsByStage.get("non-text-widgets")?.textAreaTextWidgetCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("non-text-widgets")?.codeTextWidgetShellCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("non-text-widgets")?.textTextWidgetShellCount).toBe(
    0,
  );
  expect(
    metricsByStage.get("non-text-widgets")?.textAreaTextWidgetShellCount,
  ).toBe(0);

  expect(
    metricsByStage.get("code-widgets")?.paramContainerCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("code-widgets")?.codeTextWidgetCount,
  ).toBeGreaterThan(0);
  expect(metricsByStage.get("code-widgets")?.textTextWidgetCount).toBe(0);
  expect(metricsByStage.get("code-widgets")?.textAreaTextWidgetCount).toBe(0);
  expect(metricsByStage.get("code-widgets")?.codeTextWidgetShellCount).toBe(0);
  expect(metricsByStage.get("code-widgets")?.textTextWidgetShellCount).toBe(0);
  expect(metricsByStage.get("code-widgets")?.textAreaTextWidgetShellCount).toBe(
    0,
  );
  expect(metricsByStage.get("code-widgets")?.sampleParamRowNarrowCount).toBe(0);

  expect(metricsByStage.get("full")?.staticRowCount).toBe(0);
  expect(metricsByStage.get("full")?.paramContainerCount).toBeGreaterThan(0);
  expect(metricsByStage.get("full")?.lightLabelCount).toBe(0);
  expect(metricsByStage.get("full")?.paramValueShellCount).toBe(0);
  expect(metricsByStage.get("full")?.paramUiShellCount).toBe(0);
  expect(metricsByStage.get("full")?.textWidgetShellCount).toBe(0);
  expect(metricsByStage.get("full")?.textInputDummyCount).toBeGreaterThan(0);
  expect(metricsByStage.get("full")?.codeTextWidgetCount).toBeGreaterThan(0);
  expect(metricsByStage.get("full")?.textTextWidgetCount).toBe(0);
  expect(metricsByStage.get("full")?.textAreaTextWidgetCount).toBe(0);
  expect(metricsByStage.get("full")?.codeTextWidgetShellCount).toBe(0);
  expect(metricsByStage.get("full")?.textTextWidgetShellCount).toBe(0);
  expect(metricsByStage.get("full")?.textAreaTextWidgetShellCount).toBe(0);
  expect(metricsByStage.get("full")?.sampleParamRowCount).toBeGreaterThan(0);
  expect(metricsByStage.get("full")?.sampleParamRowMinWidth).toBeGreaterThan(
    250,
  );
  expect(metricsByStage.get("full")?.sampleParamRowNarrowCount).toBe(0);
  expect(metricsByStage.get("full")?.sectionSnapdomCount).toBe(0);
  expect(metricsByStage.get("full")?.sectionSnapdomPreviewCount).toBe(0);

  expect(metricsByStage.get("full-section-snapdom")?.staticRowCount).toBe(0);
  expect(
    metricsByStage.get("full-section-snapdom")?.sectionSnapdomCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom")?.sectionSnapdomReadyCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom")?.sectionSnapdomPendingCount,
  ).toBe(0);
  expect(
    metricsByStage.get("full-section-snapdom")?.sectionSnapdomErrorCount,
  ).toBe(0);
  expect(
    metricsByStage.get("full-section-snapdom")?.sectionSnapdomPreviewCount,
  ).toBe(
    metricsByStage.get("full-section-snapdom")?.sectionSnapdomReadyCount ?? 0,
  );
  expect(
    metricsByStage.get("full-section-snapdom")?.textInputDummyCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom")?.sampleParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom")?.sampleParamRowMinWidth,
  ).toBeGreaterThan(250);
  expect(
    metricsByStage.get("full-section-snapdom")?.sampleParamRowNarrowCount,
  ).toBe(0);

  expect(
    metricsByStage.get("full-section-opacity-hidden")?.staticRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("full-section-opacity-hidden")?.sectionSnapdomCount,
  ).toBe(0);
  expect(
    metricsByStage.get("full-section-opacity-hidden")
      ?.sectionOpacityHiddenCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-opacity-hidden")
      ?.sectionOpacityHiddenHiddenCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-opacity-hidden")
      ?.sectionOpacityHiddenVisibleActiveCount,
  ).toBeLessThanOrEqual(1);
  expect(
    (metricsByStage.get("full-section-opacity-hidden")
      ?.sectionOpacityHiddenHiddenCount ?? 0) +
      (metricsByStage.get("full-section-opacity-hidden")
        ?.sectionOpacityHiddenVisibleActiveCount ?? 0),
  ).toBe(
    metricsByStage.get("full-section-opacity-hidden")
      ?.sectionOpacityHiddenCount,
  );
  expect(
    metricsByStage.get("full-section-opacity-hidden")?.textInputDummyCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-opacity-hidden")?.sampleParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-opacity-1pct")?.staticRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("full-section-opacity-1pct")?.sectionSnapdomCount,
  ).toBe(0);
  expect(
    metricsByStage.get("full-section-opacity-1pct")?.sectionOpacityHiddenCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-opacity-1pct")
      ?.sectionOpacityHiddenHiddenCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-opacity-1pct")
      ?.sectionOpacityHiddenVisibleActiveCount,
  ).toBeLessThanOrEqual(1);
  expect(
    metricsByStage.get("full-section-opacity-1pct")?.textInputDummyCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-opacity-1pct")?.sampleParamRowCount,
  ).toBeGreaterThan(0);

  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")?.staticRowCount,
  ).toBe(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")?.sectionSnapdomCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")
      ?.sectionSnapdomReadyCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")
      ?.sectionSnapdomPendingCount,
  ).toBe(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")
      ?.sectionSnapdomPreviewCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")
      ?.sectionOpacityHiddenCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")
      ?.sectionOpacityHiddenHiddenCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")
      ?.sectionOpacityHiddenVisibleActiveCount,
  ).toBeLessThanOrEqual(1);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")?.textInputDummyCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")?.sampleParamRowCount,
  ).toBeGreaterThan(0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")
      ?.sampleParamRowMinWidth,
  ).toBeGreaterThan(250);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")
      ?.sampleParamRowNarrowCount,
  ).toBe(0);

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
  expect(
    metricsByStage.get("param-top-level-flat-shell")?.domCount,
  ).toBeLessThan(metricsByStage.get("param-flat-shell")?.domCount ?? 0);
  expect(
    metricsByStage.get("param-top-level-simple-grid-shell")?.domCount,
  ).toBeLessThan(metricsByStage.get("param-simple-grid-shell")?.domCount ?? 0);
  expect(
    metricsByStage.get("param-top-level-structure-shell")?.domCount,
  ).toBeLessThan(metricsByStage.get("param-structure-shell")?.domCount ?? 0);
  expect(
    metricsByStage.get("param-parent-structure-shell")?.domCount,
  ).toBeLessThan(metricsByStage.get("param-structure-shell")?.domCount ?? 0);
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
  expect(metricsByStage.get("non-text-widgets")?.domCount).toBeLessThanOrEqual(
    metricsByStage.get("code-widgets")?.domCount ?? 0,
  );
  expect(metricsByStage.get("non-text-widgets")?.domCount).toBeLessThan(
    metricsByStage.get("full")?.domCount ?? 0,
  );
  expect(metricsByStage.get("full-section-snapdom")?.domCount).toBeGreaterThan(
    metricsByStage.get("full")?.domCount ?? 0,
  );
  expect(
    metricsByStage.get("full-section-opacity-hidden")?.domCount,
  ).toBeGreaterThanOrEqual(metricsByStage.get("full")?.domCount ?? 0);
  expect(
    metricsByStage.get("full-section-snapdom-hidden-live")?.domCount,
  ).toBeGreaterThanOrEqual(metricsByStage.get("full")?.domCount ?? 0);
});

test("full-section-snapdom hydrates a clicked section body back to live controls", async ({
  page,
}) => {
  await ensureAppReady(page);
  await assertSectionStageActivatesToLiveControls(page, "full-section-snapdom");
});

test("full-section-snapdom-hidden-live reveals a clicked section body without losing live controls", async ({
  page,
}) => {
  await ensureAppReady(page);
  await assertSectionStageActivatesToLiveControls(
    page,
    "full-section-snapdom-hidden-live",
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
  if (stage === "full-section-snapdom") {
    await waitForSectionSnapdomStage(page, false);
    await assertSectionSnapdomPreviewFidelity(page);
  }
  if (stage === "full-section-snapdom-hidden-live") {
    await waitForSectionSnapdomStage(page, true);
    await assertSectionSnapdomPreviewFidelity(page);
  }
  if (
    stage === "full-section-opacity-hidden" ||
    stage === "full-section-opacity-1pct"
  ) {
    await page.waitForFunction(() => {
      const roots = document.querySelectorAll(
        "[data-settings-benchmark-section-opacity-hidden]",
      );
      const hiddenRoots = document.querySelectorAll(
        '[data-settings-benchmark-section-opacity-hidden-status="hidden"]',
      ).length;
      const activeRoots = document.querySelectorAll(
        '[data-settings-benchmark-section-opacity-hidden-status="visible-active"]',
      ).length;
      return (
        roots.length > 0 &&
        hiddenRoots > 0 &&
        hiddenRoots + activeRoots === roots.length &&
        activeRoots <= 1
      );
    });
  }
}

async function waitForSectionSnapdomStage(
  page: Page,
  expectHiddenLive: boolean,
): Promise<void> {
  await page.waitForFunction((hiddenLive) => {
    const snapdomRoots = document.querySelectorAll(
      "[data-settings-benchmark-section-snapdom]",
    ).length;
    const readyRoots = document.querySelectorAll(
      '[data-settings-benchmark-section-snapdom-status="ready"]',
    ).length;
    const pendingRoots = document.querySelectorAll(
      '[data-settings-benchmark-section-snapdom-status="pending"]',
    ).length;
    const hiddenRoots = document.querySelectorAll(
      '[data-settings-benchmark-section-opacity-hidden-status="hidden-ready"]',
    ).length;
    if (snapdomRoots === 0 || readyRoots === 0 || pendingRoots !== 0) {
      return false;
    }

    if (hiddenLive && hiddenRoots === 0) {
      return false;
    }

    const previews = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        "[data-settings-benchmark-section-snapdom-preview]",
      ),
    );
    if (previews.length === 0) {
      return false;
    }

    return previews.every((preview) => preview.complete && preview.naturalWidth > 0);
  }, expectHiddenLive);
}

async function assertSectionSnapdomPreviewFidelity(page: Page): Promise<void> {
  const fidelity = await page.evaluate(() => {
    const flowRoot = document.querySelector(".react-flow");
    if (!(flowRoot instanceof HTMLElement)) {
      return {
        rootCount: 0,
        previewCount: 0,
        sampleCount: 0,
        undersizedCount: 0,
        collapsedCount: 0,
        sample: [],
      };
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
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-settings-benchmark-section-snapdom]",
      ),
    );
    const previews = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        "[data-settings-benchmark-section-snapdom-preview]",
      ),
    );
    const sample = roots
      .map((root) => {
      const sectionId =
        root.getAttribute("data-settings-benchmark-section-snapdom") ?? "";
      const overlay = document.querySelector<HTMLElement>(
        `[data-settings-benchmark-section-snapdom-preview-overlay="${sectionId}"]`,
      );
      const preview = overlay?.querySelector<HTMLImageElement>(
        "[data-settings-benchmark-section-snapdom-preview]",
      );
      const captureWidth = Number(
        root.getAttribute("data-settings-benchmark-section-snapdom-capture-width") ??
          "0",
      );
      const captureHeight = Number(
        root.getAttribute("data-settings-benchmark-section-snapdom-capture-height") ??
          "0",
      );
      const overlayRect = overlay?.getBoundingClientRect();
      const liveChildWidths = Array.from(root.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement)
        .map((child) => child.getBoundingClientRect().width / viewportScale)
        .filter((width) => Number.isFinite(width) && width > 0);
      const minLiveChildWidth =
        liveChildWidths.length > 0 ? Math.min(...liveChildWidths) : 0;
      const overlayWidth =
        overlayRect !== undefined
          ? overlayRect.width / viewportScale
          : 0;
      const overlayHeight =
        overlayRect !== undefined
          ? overlayRect.height / viewportScale
          : 0;

      return {
        naturalWidth: preview?.naturalWidth ?? 0,
        naturalHeight: preview?.naturalHeight ?? 0,
        overlayWidth,
        overlayHeight,
        captureWidth,
        captureHeight,
        minLiveChildWidth,
        liveChildCount: liveChildWidths.length,
        isUndersized:
          (preview?.naturalWidth ?? 0) <
            Math.max(100, captureWidth * 0.5) ||
          (preview?.naturalHeight ?? 0) <
            Math.max(100, captureHeight * 0.5),
        isCollapsed:
          liveChildWidths.length === 0 ||
          minLiveChildWidth < 250 ||
          overlayWidth < 250 ||
          overlayHeight < 40,
      };
      })
      .filter((preview) => preview.naturalWidth > 0 && preview.overlayWidth > 0)
      .slice(0, 8);

    return {
      rootCount: roots.length,
      previewCount: previews.length,
      sampleCount: sample.length,
      undersizedCount: sample.filter((preview) => preview.isUndersized).length,
      collapsedCount: sample.filter((preview) => preview.isCollapsed).length,
      sample,
    };
  });

  expect(fidelity.rootCount).toBeGreaterThan(0);
  expect(fidelity.previewCount).toBeGreaterThan(0);
  expect(fidelity.sampleCount).toBeGreaterThan(0);
  expect(fidelity.undersizedCount).toBe(0);
  expect(fidelity.collapsedCount).toBe(0);
}

async function assertSectionStageActivatesToLiveControls(
  page: Page,
  stage: "full-section-snapdom" | "full-section-snapdom-hidden-live",
): Promise<void> {
  await openBenchmarkStage(page, stage);

  const firstSection = page.locator("section[data-section-id]").first();
  await expect(firstSection).toBeVisible();
  await firstSection.click();

  await page.waitForFunction(() => {
    const liveSections = document.querySelectorAll(
      '[data-settings-benchmark-section-snapdom-status="live-active"]',
    );
    if (liveSections.length !== 1) {
      return false;
    }

    const liveBody = liveSections[0];
    if (!(liveBody instanceof HTMLElement)) {
      return false;
    }

    return (
      liveBody.querySelector(
        'input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), [role="switch"]:not([aria-disabled="true"])',
      ) !== null
    );
  });

  const activationMetrics = await page.evaluate(() => {
    const liveSections = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-settings-benchmark-section-snapdom-status="live-active"]',
      ),
    );
    const liveBody = liveSections[0] ?? null;
    return {
      liveSectionCount: liveSections.length,
      readyPreviewCount: document.querySelectorAll(
        '[data-settings-benchmark-section-snapdom-status="ready"]',
      ).length,
      hiddenReadyCount: document.querySelectorAll(
        '[data-settings-benchmark-section-opacity-hidden-status="hidden-ready"]',
      ).length,
      previewCount: document.querySelectorAll(
        "[data-settings-benchmark-section-snapdom-preview]",
      ).length,
      liveParamRowCount:
        liveBody?.querySelectorAll('[data-param-row="true"]').length ?? 0,
      interactiveControlCount:
        liveBody?.querySelectorAll(
          'input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), [role="switch"]:not([aria-disabled="true"])',
        ).length ?? 0,
    };
  });

  expect(activationMetrics.liveSectionCount).toBe(1);
  if (stage === "full-section-snapdom") {
    expect(activationMetrics.readyPreviewCount).toBeGreaterThan(0);
    expect(activationMetrics.hiddenReadyCount).toBe(0);
    expect(activationMetrics.previewCount).toBeGreaterThan(0);
  } else {
    expect(activationMetrics.readyPreviewCount).toBeGreaterThan(0);
    expect(activationMetrics.hiddenReadyCount).toBeGreaterThan(0);
    expect(activationMetrics.previewCount).toBeGreaterThan(0);
  }
  expect(activationMetrics.liveParamRowCount).toBeGreaterThan(0);
  expect(activationMetrics.interactiveControlCount).toBeGreaterThan(0);
}

async function collectStageMetrics(page: Page): Promise<StageMetrics> {
  return page.evaluate(() => {
    const flowRoot = document.querySelector(".react-flow");
    if (!flowRoot) {
      throw new Error("Missing react flow root.");
    }
    const paramRows = Array.from(
      flowRoot.querySelectorAll<HTMLElement>('[data-param-row="true"]'),
    );
    const topLevelParamRows = paramRows.filter(
      (row) =>
        !row.parentElement?.closest(
          "[data-settings-benchmark-nested-child-subtree]",
        ),
    );
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
      codeTextWidgetCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-text-widget-kind="code"]',
      ).length,
      textTextWidgetCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-text-widget-kind="text"]',
      ).length,
      textAreaTextWidgetCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-text-widget-kind="text-area"]',
      ).length,
      codeTextWidgetShellCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-text-widget-shell-kind="code"]',
      ).length,
      textTextWidgetShellCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-text-widget-shell-kind="text"]',
      ).length,
      textAreaTextWidgetShellCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-text-widget-shell-kind="text-area"]',
      ).length,
      resizeHandleCount: flowRoot.querySelectorAll("[data-param-resize-handle]")
        .length,
      parentRowCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-param-row-kind="parent"]',
      ).length,
      leafRowCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-param-row-kind="leaf"]',
      ).length,
      topLevelRowCount: topLevelParamRows.length,
      nestedRowCount: paramRows.length - topLevelParamRows.length,
      nestedChildSubtreeCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-nested-child-subtree]",
      ).length,
      suppressedParentRowCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-child-subtree-policy="suppressed"]',
      ).length,
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
      sectionSnapdomCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-section-snapdom]",
      ).length,
      sectionSnapdomReadyCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-section-snapdom-status="ready"]',
      ).length,
      sectionSnapdomPendingCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-section-snapdom-status="pending"]',
      ).length,
      sectionSnapdomErrorCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-section-snapdom-status="error"]',
      ).length,
      sectionSnapdomLiveActiveCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-section-snapdom-status="live-active"]',
      ).length,
      sectionSnapdomPreviewCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-section-snapdom-preview]",
      ).length,
      sectionOpacityHiddenCount: flowRoot.querySelectorAll(
        "[data-settings-benchmark-section-opacity-hidden]",
      ).length,
      sectionOpacityHiddenHiddenCount:
        flowRoot.querySelectorAll(
          '[data-settings-benchmark-section-opacity-hidden-status="hidden"]',
        ).length +
        flowRoot.querySelectorAll(
          '[data-settings-benchmark-section-opacity-hidden-status="hidden-ready"]',
        ).length,
      sectionOpacityHiddenVisibleActiveCount: flowRoot.querySelectorAll(
        '[data-settings-benchmark-section-opacity-hidden-status="visible-active"]',
      ).length,
    };
  });
}
