import { Tooltip } from "chart.js";
import Chart from "chart.js/auto";
import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { useSectionInfos } from "state/definitions";
import { useAllSectionArtifacts } from "state/hooks/artifacts";
import { localStorageFns } from "state/hooks/localStorage";
import useDeepCompareEffect from "use-deep-compare-effect";
import { getLineChartOptionsAndPlugins } from "./LineChart";

Tooltip.positioners.mousePosition = function (elements, eventPosition) {
  return { x: eventPosition.x, y: eventPosition.y };
};

function _ChartArea({ sectionId }) {
  const loadedArtifacts = useAllSectionArtifacts(sectionId, ["value"]);
  const [darkMode] = localStorageFns.darkMode.hook();
  const size = useSectionInfos((x) => x.x[sectionId].size, _.isEqual);
  const canvasRef = useRef();
  const chartRef = useRef(null);
  const xAxisColumn = "input_value";
  const secondYAxisColumns = ["quadratic"];

  const [datasetHidden, setDatasetHidden] = useState({});

  useEffect(() => {
    chartRef.current = new Chart(
      canvasRef.current,
      getLineChartOptionsAndPlugins({
        secondYAxisColumns,
        darkMode,
        setDatasetHidden,
      }),
    );

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  useDeepCompareEffect(() => {
    if (
      !loadedArtifacts ||
      Object.keys(loadedArtifacts).length === 0 ||
      !chartRef.current
    )
      return;

    const artifactData = Object.values(loadedArtifacts)[0].value;
    const xColumnIndex = artifactData.headers.indexOf(xAxisColumn);

    const labels = [];
    const datasets = [];

    for (let i = 0; i < artifactData.headers.length; i++) {
      if (i === xColumnIndex) continue;
      datasets.push({
        label: artifactData.headers[i],
        data: [],
        yAxisID: secondYAxisColumns.includes(artifactData.headers[i])
          ? "y2"
          : "y1",
        hidden: datasetHidden[artifactData.headers[i]],
      });
    }

    for (const row of artifactData.data) {
      labels.push(row[xColumnIndex]);
      let datasetIndex = 0;
      for (let i = 0; i < row.length; i++) {
        if (i === xColumnIndex) continue;
        datasets[datasetIndex].data.push(row[i]);
        datasetIndex++;
      }
    }

    const newData = { labels, datasets };

    chartRef.current.data = newData;
    chartRef.current.resize(size.width, size.height - 50);
    chartRef.current.update();
  }, [loadedArtifacts, xAxisColumn, secondYAxisColumns, size, datasetHidden]);

  useEffect(() => {
    chartRef.current.verticalLinePlugin.color = darkMode ? "white" : "black";
    chartRef.current.update();
  }, [darkMode]);

  return (
    <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
      <canvas ref={canvasRef} />
    </figure>
  );
}

export const ChartArea = React.memo(_ChartArea);
