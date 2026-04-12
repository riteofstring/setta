import {
  Chart,
  ChartConfiguration,
  ChartData,
  DefaultDataPoint,
  Plugin,
  Tooltip,
} from "chart.js";
import { ChartDataArtifact, LineChartSettings } from "utils/generatedTypes";
import {
  getAxisType,
  getOnLegendClickSetDatasetHidden,
  SetDatasetHiddenFn,
} from "./utils";

Tooltip.positioners.lineChartTooltipMousePosition = function (
  _elements,
  eventPosition,
) {
  return { x: eventPosition.x, y: eventPosition.y };
};

export function getLineChartConfig(
  setDatasetHidden: SetDatasetHiddenFn,
): ChartConfiguration<"line"> {
  return {
    type: "line",
    data: {
      datasets: [],
    },
    plugins: [verticalLinePlugin],
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
      spanGaps: true,
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
          position: "lineChartTooltipMousePosition",
          callbacks: {
            title: (context) => {
              if (context[0]) {
                return `X: ${context[0].label}`;
              }
            },
            label: (context) => {
              const label = context.dataset.label || "";
              return `${label}: ${context.formattedValue}`;
            },
          },
        },
        legend: {
          onClick: getOnLegendClickSetDatasetHidden(setDatasetHidden),
        },
      },
    },
  };
}

type LineChartData = ChartData<
  "line",
  DefaultDataPoint<"line">,
  string | number
>;

function buildLineChartDatasets(
  data: ChartDataArtifact["value"],
  chartSettings: LineChartSettings,
  datasetHidden: Record<string, boolean>,
  secondYAxisColumns: string[],
): { datasets: LineChartData["datasets"]; labels?: LineChartData["labels"] } {
  const datasets: LineChartData["datasets"] = [];
  let labels: LineChartData["labels"];

  for (const [columnName, values] of Object.entries(data)) {
    if (!Array.isArray(values)) {
      continue;
    }
    if (columnName === chartSettings.xAxisColumn) {
      labels = values;
      continue;
    }
    datasets.push({
      label: columnName,
      data: values,
      yAxisID: secondYAxisColumns.includes(columnName) ? "y2" : "y1",
      hidden: datasetHidden[columnName],
    });
  }

  return { datasets, labels: labels ?? getDefaultLineChartLabels(datasets) };
}

function getDefaultLineChartLabels(
  datasets: LineChartData["datasets"],
): LineChartData["labels"] | undefined {
  const firstDataset = datasets[0];
  if (!firstDataset || !Array.isArray(firstDataset.data)) {
    return undefined;
  }
  return Array.from({ length: firstDataset.data.length }, (_, index) => index);
}

function applyLineChartScales(
  chart: Chart,
  darkMode: boolean,
  chartSettings: LineChartSettings,
  secondYAxisColumns: string[],
  labels?: LineChartData["labels"],
) {
  chart.verticalLinePlugin.color = darkMode ? "white" : "black";

  const scaleOptions = chart.options.scales;
  if (scaleOptions?.x) {
    scaleOptions.x.type = getAxisType(chartSettings.xAxisLog, labels?.[0]);
  }
  if (scaleOptions?.y1) {
    scaleOptions.y1.type = getAxisType(chartSettings.y1AxisLog);
  }
  if (scaleOptions?.y2) {
    scaleOptions.y2.type = getAxisType(chartSettings.y2AxisLog);
    scaleOptions.y2.display = secondYAxisColumns.length > 0;
  }
}

export function updateLineChartWithNewData(
  chart: Chart,
  data: ChartDataArtifact["value"],
  datasetHidden: Record<string, boolean>,
  darkMode: boolean,
  chartSettings: LineChartSettings,
): LineChartData {
  const secondYAxisColumns = Array.isArray(chartSettings.secondYAxisColumns)
    ? chartSettings.secondYAxisColumns
    : [];
  const { datasets, labels } = buildLineChartDatasets(
    data,
    chartSettings,
    datasetHidden,
    secondYAxisColumns,
  );

  applyLineChartScales(
    chart,
    darkMode,
    chartSettings,
    secondYAxisColumns,
    labels,
  );

  if (labels) {
    return { labels, datasets };
  }
  return { datasets };
}

const verticalLinePlugin: Plugin<"line"> = {
  id: "verticalLinePlugin",
  afterInit: (chart: Chart) => {
    chart.verticalLinePlugin = {
      x: 0,
      y: 0,
      draw: false,
      width: 1,
      color: "black",
      dash: [3, 3],
    };
  },
  afterEvent: (chart, args) => {
    const { inChartArea } = args;
    const { x, y } = args.event;

    if (x === null || y === null) {
      return;
    }

    if (inChartArea) {
      // Find the nearest x-axis data point
      const xScale = chart.scales.x;
      const values = chart.data.labels as number[];

      if (!xScale) {
        return;
      }

      // Convert mouse x position to data space
      const mouseValue = xScale.getValueForPixel(x);

      if (!mouseValue) {
        return;
      }

      // Find nearest data point
      let nearestValue = values[0];

      if (nearestValue === undefined) {
        return;
      }

      let minDistance = Math.abs(mouseValue - nearestValue);

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
        ...chart.verticalLinePlugin,
        x: snapX,
        y,
        draw: true,
      };
    } else {
      chart.verticalLinePlugin = {
        ...chart.verticalLinePlugin,
        x,
        y,
        draw: false,
      };
    }

    chart.draw();
  },
  beforeDatasetsDraw: (chart) => {
    const { ctx } = chart;
    const { top, bottom } = chart.chartArea;
    const { x, draw, width, color, dash } = chart.verticalLinePlugin;

    if (!draw) return;

    ctx.save();

    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top);
    ctx.stroke();

    ctx.restore();
  },
};
