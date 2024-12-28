import { Tooltip } from "chart.js";
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
      getLineChartOptionsAndPlugins({ setDatasetHidden }),
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
    updateLineChartWithNewData({
      chartRef,
      artifactData,
      xAxisColumn,
      secondYAxisColumns,
      datasetHidden,
      darkMode,
    });
    chartRef.current.resize(size.width, size.height - 50);
    chartRef.current.update();
  }, [
    loadedArtifacts,
    xAxisColumn,
    secondYAxisColumns,
    size,
    datasetHidden,
    darkMode,
  ]);

  return (
    <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
      <canvas ref={canvasRef} />
    </figure>
  );
}

export const ChartArea = React.memo(_ChartArea);
