import { Tooltip } from "chart.js";
import Chart from "chart.js/auto";
import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { useSectionInfos } from "state/definitions";
import { useAllSectionArtifacts } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useSimulatedData(
  originalData,
  updateInterval = 1000,
  nullProbability = 0.2,
) {
  const [simulatedData, setSimulatedData] = useState(() =>
    _.cloneDeep(originalData),
  );

  // Helper function to randomly set a value to null based on probability
  const maybeSetNull = (value) => {
    return Math.random() < nullProbability ? null : value;
  };

  useEffect(() => {
    if (!originalData || Object.keys(originalData).length === 0) return;

    setSimulatedData(_.cloneDeep(originalData));

    const intervalId = setInterval(() => {
      setSimulatedData((prevData) => {
        const newData = _.cloneDeep(prevData);
        const artifactId = Object.keys(newData)[0];
        const artifact = newData[artifactId];
        const data = artifact.value.data;

        const lastRow = data[data.length - 1];
        const nextInputValue = lastRow[0] + (data[1][0] - data[0][0]);

        // Calculate new values
        const newValues = [
          nextInputValue, // Always keep the input value (x-axis)
          Math.sin(nextInputValue),
          Math.cos(nextInputValue),
          Math.sin(nextInputValue) * Math.exp(-Math.abs(nextInputValue / 10)),
          nextInputValue * nextInputValue,
        ];

        // Randomly set some values to null, except for the first value (x-axis)
        const newRow = [
          newValues[0],
          ...newValues.slice(1).map((value) => maybeSetNull(value)),
        ];

        artifact.value.data = [...data, newRow];

        return newData;
      });
    }, updateInterval);

    return () => clearInterval(intervalId);
  }, [originalData, updateInterval, nullProbability]);

  return simulatedData;
}

Tooltip.positioners.mousePosition = function (elements, eventPosition) {
  return { x: eventPosition.x, y: eventPosition.y };
};

const verticalLinePlugin = {
  id: "verticalLinePlugin",
  defaults: {
    width: 1,
    color: "#FF4949",
    dash: [3, 3],
  },
  afterInit: (chart, args, opts) => {
    chart.verticalLinePlugin = {
      x: 0,
      y: 0,
    };
  },
  afterEvent: (chart, args) => {
    const { inChartArea } = args;
    const { x, y } = args.event;

    if (inChartArea) {
      // Find the nearest x-axis data point
      const xScale = chart.scales.x;
      const pixels = xScale.getPixelForValue(x);
      const values = chart.data.labels;

      // Convert mouse x position to data space
      const mouseValue = xScale.getValueForPixel(x);

      // Find nearest data point
      let nearestValue = values[0];
      let minDistance = Math.abs(mouseValue - values[0]);

      for (const value of values) {
        const distance = Math.abs(mouseValue - value);
        if (distance < minDistance) {
          minDistance = distance;
          nearestValue = value;
        }
      }

      // Convert back to pixels for drawing
      const snapX = xScale.getPixelForValue(nearestValue);

      chart.verticalLinePlugin = {
        x: snapX,
        y,
        draw: true,
      };
    } else {
      chart.verticalLinePlugin = {
        x,
        y,
        draw: false,
      };
    }

    chart.draw();
  },
  beforeDatasetsDraw: (chart, args, opts) => {
    const { ctx } = chart;
    const { top, bottom } = chart.chartArea;
    const { x, draw } = chart.verticalLinePlugin;
    if (!draw) return;

    ctx.save();

    ctx.beginPath();
    ctx.lineWidth = opts.width;
    ctx.strokeStyle = opts.color;
    ctx.setLineDash(opts.dash);
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top);
    ctx.stroke();

    ctx.restore();
  },
};

function _ChartArea({ sectionId }) {
  const loadedArtifacts = useAllSectionArtifacts(sectionId, ["value"]);
  const simulatedData = useSimulatedData(loadedArtifacts);
  const size = useSectionInfos((x) => x.x[sectionId].size, _.isEqual);
  const canvasRef = useRef();
  const chartRef = useRef(null);
  const xAxisColumn = "input_value";
  const secondYAxisColumns = ["quadratic"];

  const [datasetHidden, setDatasetHidden] = useState({});

  useDeepCompareEffect(() => {
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: [],
        datasets: [],
      },
      plugins: [verticalLinePlugin],
      options: {
        animation: false,
        responsive: false,
        maintainAspectRatio: false,
        spanGaps: true,
        scales: {
          x: {
            type: "linear",
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
            display: secondYAxisColumns.length > 0,
          },
        },
        plugins: {
          legend: {
            onClick: (evt, legendItem, legend) => {
              setDatasetHidden((prev) => ({
                ...prev,
                [legendItem.text]: !prev[legendItem.text],
              }));
              Chart.defaults.plugins.legend.onClick(evt, legendItem, legend);
            },
          },
          tooltip: {
            mode: "index",
            intersect: false,
            position: "mousePosition",
            callbacks: {
              title: (context) => {
                return `X: ${context[0].label}`;
              },
              label: (context) => {
                const label = context.dataset.label || "";
                return `${label}: ${context.formattedValue}`;
              },
            },
          },
          verticalLinePlugin: {
            color: "black",
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [secondYAxisColumns]);

  useDeepCompareEffect(() => {
    if (
      !simulatedData ||
      Object.keys(simulatedData).length === 0 ||
      !chartRef.current
    )
      return;

    const artifactData = Object.values(simulatedData)[0].value;
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
    chartRef.current.update();
    chartRef.current.resize(size.width, size.height - 50);
  }, [simulatedData, xAxisColumn, secondYAxisColumns, size, datasetHidden]);

  return (
    <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
      <canvas ref={canvasRef} />
    </figure>
  );
}

export const ChartArea = React.memo(_ChartArea);
