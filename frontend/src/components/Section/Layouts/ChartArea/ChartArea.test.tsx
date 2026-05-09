import { renderToStaticMarkup } from "react-dom/server";
import { useChartData, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChartTypeEnum,
  createChartDataArtifact,
  createChartSectionImpl,
  createCore,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChartArea } from "./ChartArea";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

describe("ChartArea", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders the chart canvas for a chart section", () => {
    const sectionId = "chart-section";
    const variantId = "chart-variant";
    const implId = "chart-impl";
    const dataPath = "artifacts/chart.csv";

    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
      });
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: "Chart",
          variants: [variantId],
          defaultVariant: variantId,
        }),
      };
      state.sectionVariants = {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      };
      state.sectionImpls = {
        [implId]: createChartSectionImpl({
          ...{
            dataPath,
          },
          ...{
            id: implId,
            chartSettings: {
              type: ChartTypeEnum.scatter,
              xAxisColumn: "time",
              categoryColumn: "series",
              xAxisLog: false,
              yAxisLog: false,
            },
          },
        }),
      };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
      state.shownParamIds = {
        [variantId]: {
          pinned: [],
          unpinned: [],
        },
      };
    });
    syncStoreInitialState(useProjectState);

    useChartData.setState((state) => ({
      ...state,
      x: {
        [dataPath]: createChartDataArtifact({
          id: dataPath,
          value: {
            time: [0, 1],
            value: [10, 12],
            series: ["A", "B"],
          },
        }),
      },
    }));
    syncStoreInitialState(useChartData);

    const markup = renderToStaticMarkup(<ChartArea sectionId={sectionId} />);

    expect(markup).toContain("<figure");
    expect(markup).toContain("<canvas");
  });
});
