/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useChartData, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  ChartTypeEnum,
  createChartDataArtifact,
  createChartSectionImpl,
  createCore,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChartAreaSettings } from "./ChartAreaSettings";

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

type RenderedChartAreaSettings = {
  host: HTMLDivElement;
  root: Root;
};

async function renderChartAreaSettings(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<ChartAreaSettings sectionId={sectionId} />);
  });

  return { host, root } satisfies RenderedChartAreaSettings;
}

describe("ChartAreaSettings", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("renders chart controls when chart data is available", async () => {
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
              type: ChartTypeEnum.line,
              xAxisColumn: "time",
              secondYAxisColumns: ["humidity"],
              xAxisLog: true,
              y1AxisLog: false,
              y2AxisLog: false,
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
            humidity: [50, 55],
          },
        }),
      },
    }));
    syncStoreInitialState(useChartData);

    const { host, root } = await renderChartAreaSettings(sectionId);

    try {
      expect(host.textContent).toContain("Chart Config");
      expect(host.textContent).toContain("Data Path");
      expect(host.textContent).toContain("Chart Type");
      expect(host.textContent).toContain("X-Axis Column");
      expect(host.textContent).toContain("Y1-Axis Log Scale");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
