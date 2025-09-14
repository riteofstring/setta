import Chart from "chart.js/auto";
import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { listenForCanvasToBase64Requests } from "state/actions/temporaryMiscState";
import { useLocalStorage, useProjectState } from "state/definitions";
import { useLoadedChartData } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";
import {
  ChartType,
  ChartTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { canvasToBase64 } from "../DrawArea/base64Conversion";
import {
  getLineChartOptionsAndPlugins,
  updateLineChartWithNewData,
} from "./LineChart";
import {
  getScatterChartOptionsAndPlugins,
  updateScatterChartWithNewData,
} from "./ScatterChart";

function _ChartArea({ sectionId }: { sectionId: string }) {
  // const { getRootProps, isDragActive } = useLoadArtifactViaDropzone(
  //   sectionId,
  //   false,
  //   ArtifactTypeEnum.LIST,
  // );

  const isDragActive = false;

  return (
    <figure
      className={`section-w-full section-row-main single-cell-container flex h-auto w-full max-w-full items-center justify-items-center overflow-clip ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`}
      // {...getRootProps()}
    >
      <ChartAreaCore sectionId={sectionId} />
    </figure>
  );
}

function _ChartAreaCore({ sectionId }: { sectionId: string }) {
  const dataPath = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Chart,
    );
    return impl.dataPath;
  });
  const data = useLoadedChartData(dataPath);
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
  const [datasetHidden, setDatasetHidden] = useState({});

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const optionsAndPluginsFn = getOptionsAndPluginsFn(chartSettings.type);

    chartRef.current = new Chart(
      canvasRef.current,
      _.merge(
        {
          data: {
            datasets: [],
          },
          options: {
            animation: false,
            responsive: false,
            maintainAspectRatio: false,
            scales: {
              x: {
                type: "linear",
                position: "bottom",
              },
              y1: {
                type: "linear",
                position: "left",
              },
              y2: {
                type: "linear",
                position: "right",
                grid: {
                  drawOnChartArea: false,
                },
              },
            },
            plugins: {
              legend: {
                onClick: (evt, legendItem, legend) => {
                  setDatasetHidden((prev) => ({
                    ...prev,
                    [legendItem.text]: !prev[legendItem.text],
                  }));
                  Chart.defaults.plugins.legend.onClick(
                    evt,
                    legendItem,
                    legend,
                  );
                },
              },
            },
          },
        },
        optionsAndPluginsFn(),
      ),
    );

    chartRef.current.resize(size.width - 25, size.height - 50);

    const unsub = listenForCanvasToBase64Requests(sectionId, () =>
      canvasToBase64(canvasRef.current),
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
    if (!chartRef.current) {
      return;
    }

    const updateFn = getUpdaterFn(chartSettings.type);
    const newData = updateFn({
      chartRef,
      data,
      datasetHidden,
      darkMode,
      chartSettings,
    });

    chartRef.current.data = newData;

    const scaleOptions = chartRef.current.options.scales;
    scaleOptions.x.type = getAxisType(
      chartSettings.xAxisLog,
      newData.labels?.[0],
    );
    scaleOptions.y1.type = getAxisType(chartSettings.y1AxisLog);
    scaleOptions.y2.type = getAxisType(chartSettings.y2AxisLog);
    scaleOptions.y2.display = chartSettings.secondYAxisColumns.length > 0;

    chartRef.current.resize(size.width - 25, size.height - 50);
    chartRef.current.update();
  }, [data, size, datasetHidden, darkMode, chartSettings]);

  return <canvas ref={canvasRef} />;
}

const ChartAreaCore = React.memo(_ChartAreaCore);

export const ChartArea = React.memo(_ChartArea);

function getOptionsAndPluginsFn(type: ChartType) {
  switch (type) {
    case ChartTypeEnum.line:
      return getLineChartOptionsAndPlugins;
    case ChartTypeEnum.scatter:
      return getScatterChartOptionsAndPlugins;
    default:
      return type satisfies never;
  }
}

function getUpdaterFn(type: ChartType) {
  switch (type) {
    case ChartTypeEnum.line:
      return updateLineChartWithNewData;
    case ChartTypeEnum.scatter:
      return updateScatterChartWithNewData;
    default:
      return type satisfies never;
  }
}

function getAxisType(isLog, sampleData) {
  if (typeof sampleData === "string") {
    return "category";
  }
  return isLog ? "logarithmic" : "linear";
}
