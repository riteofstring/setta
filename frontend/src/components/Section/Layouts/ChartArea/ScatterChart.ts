import {
  ChartConfiguration,
  ChartData,
  DefaultDataPoint,
  Tooltip,
} from "chart.js";
import { Chart } from "chart.js/dist";
import { ScatterChartSettings } from "utils/generatedTypes";
import { getOnLegendClickSetDatasetHidden, SetDatasetHiddenFn } from "./utils";

Tooltip.positioners.scatterChartTooltipMousePosition = function (
  _elements,
  eventPosition,
) {
  return { x: eventPosition.x, y: eventPosition.y };
};

export function getScatterChartConfig(
  setDatasetHidden: SetDatasetHiddenFn,
): ChartConfiguration<"scatter"> {
  return {
    type: "scatter",
    data: {
      datasets: [],
    },
    plugins: [crosshairPlugin],
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
      },
      plugins: {
        tooltip: {
          enabled: true,
          mode: "nearest",
          intersect: false,
          position: "scatterChartTooltipMousePosition",
          callbacks: {
            title: (context) => {
              const point = context[0];
              if (point) {
                return `(${point.parsed.x.toFixed(2)}, ${point.parsed.y.toFixed(2)})`;
              }
            },
            label: (context) => {
              const label = context.dataset.label || "";
              return label;
            },
          },
        },
        legend: { onClick: getOnLegendClickSetDatasetHidden(setDatasetHidden) },
      },
    },
  };
}

type ScatterChartData = ChartData<
  "scatter",
  DefaultDataPoint<"scatter">,
  string | number
>;

export function updateScatterChartWithNewData(
  chart: Chart,
  data: Record<string, any>,
  datasetHidden: Record<string, boolean>,
  darkMode: boolean,
  chartSettings: ScatterChartSettings,
): ScatterChartData {
  let categoryValue = "No Category";
  const firstColumnLength = Object.values(data)[0]?.length;

  if (!firstColumnLength) {
    return { datasets: [] };
  }

  const categoryColumn = chartSettings.categoryColumn;
  let xAxisColumn = Object.keys(data)[0];
  if (chartSettings.xAxisColumn) {
    xAxisColumn = chartSettings.xAxisColumn;
  }
  if (!xAxisColumn) {
    return { datasets: [] };
  }
  const yAxisColumn = Object.keys(data).find(
    (a) => ![categoryColumn, xAxisColumn].includes(a),
  );

  // yAxisColumn might be undefined if categoryColumn and xAxisColumn
  // are using the only available columns
  // TODO: maybe this should be guaranteed to be avoided by
  // updating axis column names in processChartArtifacts
  if (!yAxisColumn) {
    return { datasets: [] };
  }

  const groupedData: Record<
    string | number,
    Array<{ x: number; y: number; columnName: string }>
  > = {};
  for (let i = 0; i < firstColumnLength; i++) {
    if (categoryColumn) {
      categoryValue = data[categoryColumn][i];
    }
    if (!(categoryValue in groupedData)) {
      groupedData[categoryValue] = [];
    }
    groupedData[categoryValue].push({
      x: data[xAxisColumn][i],
      y: data[yAxisColumn][i],
      columnName: yAxisColumn,
    });
  }

  // Create dataset for each category
  const datasets = Object.entries(groupedData).map(([category, points]) => ({
    label: category,
    data: points,
    yAxisID: "y1",
    hidden: datasetHidden[category],
    pointRadius: 4,
    pointHoverRadius: 6,
  }));

  chart.crosshairPlugin.color = darkMode ? "white" : "black";

  return { datasets };
}

const crosshairPlugin = {
  id: "crosshairPlugin",
  afterInit: (chart) => {
    chart.crosshairPlugin = {
      x: 0,
      y: 0,
      xValue: 0,
      yValue: 0,
      draw: false,
      width: 1,
      color: "black",
      dash: [3, 3],
    };
  },
  afterEvent: (chart, args) => {
    const { inChartArea } = args;
    const { x, y } = args.event;

    if (inChartArea) {
      // Find the nearest data point across all datasets
      let minDistance = Infinity;
      let nearestPoint = null;

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (dataset.hidden) return;

        dataset.data.forEach((point, pointIndex) => {
          const xPixel = chart.scales.x.getPixelForValue(point.x);
          const yPixel = chart.scales[dataset.yAxisID].getPixelForValue(
            point.y,
          );

          const distance = Math.sqrt(
            Math.pow(x - xPixel, 2) + Math.pow(y - yPixel, 2),
          );

          if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = {
              x: xPixel,
              y: yPixel,
              xValue: point.x,
              yValue: point.y,
              datasetIndex,
              pointIndex,
            };
          }
        });
      });

      if (nearestPoint) {
        chart.crosshairPlugin = {
          ...chart.crosshairPlugin,
          x: nearestPoint.x,
          y: nearestPoint.y,
          xValue: nearestPoint.xValue,
          yValue: nearestPoint.yValue,
          draw: true,
        };

        // Update tooltip to show for the nearest point
        const tooltipItems = [
          {
            datasetIndex: nearestPoint.datasetIndex,
            index: nearestPoint.pointIndex,
          },
        ];

        chart.tooltip.setActiveElements(tooltipItems);
        chart.tooltip.update();
      }
    } else {
      chart.crosshairPlugin = {
        ...chart.crosshairPlugin,
        x,
        y,
        draw: false,
      };
      chart.tooltip.setActiveElements([], { x, y });
    }

    chart.draw();
  },
  beforeDatasetsDraw: (chart) => {
    const { ctx } = chart;
    const { x, y, draw, width, color, dash } = chart.crosshairPlugin;
    const { top, bottom, left, right } = chart.chartArea;

    if (!draw) return;

    ctx.save();

    // Draw vertical line
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top);
    ctx.stroke();

    // Draw horizontal line
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    // Draw point indicator
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.restore();
  },
};
