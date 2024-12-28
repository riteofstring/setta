import Chart from "chart.js/auto";
import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { useSectionInfos } from "state/definitions";
import { useAllSectionArtifacts } from "state/hooks/artifacts";
import { localStorageFns } from "state/hooks/localStorage";
import useDeepCompareEffect from "use-deep-compare-effect";
import {
  getLineChartOptionsAndPlugins,
  updateLineChartWithNewData,
} from "./LineChart";
import {
  getScatterChartOptionsAndPlugins,
  updateScatterChartWithNewData,
} from "./ScatterChart";

function _ChartArea({ sectionId }) {
  const loadedArtifacts = useAllSectionArtifacts(sectionId, ["value"]);
  const [darkMode] = localStorageFns.darkMode.hook();
  const size = useSectionInfos((x) => x.x[sectionId].size, _.isEqual);
  const chartSettings = useSectionInfos(
    (x) => x.x[sectionId].chartSettings,
    _.isEqual,
  );
  const canvasRef = useRef();
  const chartRef = useRef(null);
  const xAxisColumn = "input_value";
  const secondYAxisColumns = ["quadratic"];
  const [datasetHidden, setDatasetHidden] = useState({});

  useEffect(() => {
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
        optionsAndPluginsFn({ setDatasetHidden }),
      ),
    );

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartSettings.type]);

  useDeepCompareEffect(() => {
    if (
      !loadedArtifacts ||
      Object.keys(loadedArtifacts).length === 0 ||
      !chartRef.current
    )
      return;

    const artifactData = Object.values(loadedArtifacts)[0].value;
    const updateFn = getUpdaterFn(chartSettings.type);
    updateFn({
      chartRef,
      artifactData,
      xAxisColumn,
      secondYAxisColumns,
      datasetHidden,
      darkMode,
      chartSettings,
    });

    setAxisType(chartRef.current.options.scales.x, chartSettings.xAxisLog);
    setAxisType(chartRef.current.options.scales.y1, chartSettings.y1AxisLog);
    setAxisType(chartRef.current.options.scales.y2, chartSettings.y2AxisLog);
    chartRef.current.scales.y2.display = secondYAxisColumns.length > 0;

    chartRef.current.resize(size.width, size.height - 50);
    chartRef.current.update();
  }, [
    loadedArtifacts,
    xAxisColumn,
    secondYAxisColumns,
    size,
    datasetHidden,
    darkMode,
    chartSettings,
  ]);

  return (
    <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
      <canvas ref={canvasRef} />
    </figure>
  );
}

export const ChartArea = React.memo(_ChartArea);

function getOptionsAndPluginsFn(type) {
  switch (type) {
    case "line":
      return getLineChartOptionsAndPlugins;
    case "scatter":
      return getScatterChartOptionsAndPlugins;
  }
}

function getUpdaterFn(type) {
  switch (type) {
    case "line":
      return updateLineChartWithNewData;
    case "scatter":
      return updateScatterChartWithNewData;
  }
}

function setAxisType(axis, isLog) {
  axis.type = isLog ? "logarithmic" : "linear";
}
