import Chart from "chart.js/auto";
import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { listenForCanvasToBlobRequests } from "state/actions/temporaryMiscState";
import { useLocalStorage, useProjectState } from "state/definitions";
import { useLoadedChartData } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";
import {
  BaseChartSettingsUnion,
  ChartDataArtifact,
  ChartType,
  ChartTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { canvasToBlob } from "../DrawArea/binaryConversion";
import { getLineChartConfig, updateLineChartWithNewData } from "./LineChart";
import {
  getScatterChartConfig,
  updateScatterChartWithNewData,
} from "./ScatterChart";

const CHART_GPU_CONTROL_PREFIX = "chart";

function _ChartArea({ sectionId }: { sectionId: string }) {
  // const { getRootProps, isDragActive } = useLoadArtifactViaDropzone(
  //   sectionId,
  //   false,
  //   ArtifactTypeEnum.LIST,
  // );

  const isDragActive = false;

  return (
    <figure
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} section-w-full section-row-main single-cell-container flex h-auto w-full max-w-full items-center justify-items-center overflow-clip ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`}
      data-gpu-flow-control={`${CHART_GPU_CONTROL_PREFIX}:${sectionId}`}
      data-gpu-flow-interactive="true"
      // {...getRootProps()}
    >
      <ChartAreaCore sectionId={sectionId} />
    </figure>
  );
}

function _ChartAreaCore({ sectionId }: { sectionId: string }) {
  const data = useLoadedChartData(sectionId);
  const darkMode = useLocalStorage((x) => x.darkMode);
  const { size, chartSettings } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Chart,
    );
    return { size: impl.size, chartSettings: impl.chartSettings };
  }, _.isEqual);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart>(null);
  const [datasetHidden, setDatasetHidden] = useState<Record<string, boolean>>(
    {},
  );

  function resize() {
    if (chartRef.current && size.width !== "auto" && size.height !== "auto") {
      chartRef.current.resize(size.width - 25, size.height - 50);
    }
  }

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const configuration = getChartConfig(chartSettings.type, setDatasetHidden);
    chartRef.current = new Chart(canvasRef.current, configuration);
    resize();

    const unsub = listenForCanvasToBlobRequests(sectionId, () =>
      canvasRef.current ? canvasToBlob(canvasRef.current) : null,
    );

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      unsub();
    };
  }, [chartSettings.type]);

  useDeepCompareEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    const newData = updateChartWithNewData(
      chart,
      data,
      datasetHidden,
      darkMode,
      chartSettings,
    );

    chart.data = newData;

    resize();
    chart.update();
  }, [data, size, datasetHidden, darkMode, chartSettings]);

  return (
    <canvas
      ref={canvasRef}
      className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
      data-gpu-flow-control={`${CHART_GPU_CONTROL_PREFIX}:canvas:${sectionId}`}
      data-gpu-flow-interactive="true"
    />
  );
}

const ChartAreaCore = React.memo(_ChartAreaCore);

export const ChartArea = React.memo(_ChartArea);

function getChartConfig(type: ChartType, setDatasetHidden) {
  switch (type) {
    case ChartTypeEnum.line:
      return getLineChartConfig(setDatasetHidden);
    case ChartTypeEnum.scatter:
      return getScatterChartConfig(setDatasetHidden);
    default:
      return type satisfies never;
  }
}

function updateChartWithNewData(
  chart: Chart,
  data: ChartDataArtifact["value"],
  datasetHidden: Record<string, boolean>,
  darkMode: boolean,
  chartSettings: BaseChartSettingsUnion,
) {
  switch (chartSettings.type) {
    case ChartTypeEnum.line:
      return updateLineChartWithNewData(
        chart,
        data,
        datasetHidden,
        darkMode,
        chartSettings,
      );
    case ChartTypeEnum.scatter:
      return updateScatterChartWithNewData(
        chart,
        data,
        datasetHidden,
        darkMode,
        chartSettings,
      );
    default:
      return chartSettings satisfies never;
  }
}
