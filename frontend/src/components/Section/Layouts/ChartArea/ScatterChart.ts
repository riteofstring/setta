import {
  Chart,
  ChartConfiguration,
  ChartData,
  DefaultDataPoint,
  Plugin,
  Tooltip,
} from "chart.js";
import { ChartDataArtifact, ScatterChartSettings } from "utils/generatedTypes";
import {
  getAxisType,
  getOnLegendClickSetDatasetHidden,
  SetDatasetHiddenFn,
} from "./utils";

Tooltip.positioners.scatterChartTooltipMousePosition = function (
  _elements,
  eventPosition,
) {
  if (!eventPosition) {
    // not sure how this works but it's needed
    return false;
  }
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
        y: {
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

type ScatterColumnValues = ChartDataArtifact["value"][string];

type ScatterChartColumns = {
  categoryValues?: ScatterColumnValues;
  rowCount: number;
  xValues: ScatterColumnValues;
  yAxisColumn: string;
  yValues: ScatterColumnValues;
};

type ScatterPoint = {
  x: number;
  y: number;
};

function getFirstColumnKey(
  data: ChartDataArtifact["value"],
): string | undefined {
  return Object.keys(data)[0];
}

function getScatterRowCount(data: ChartDataArtifact["value"]): number {
  const firstColumnKey = getFirstColumnKey(data);
  if (!firstColumnKey) {
    return 0;
  }
  return data[firstColumnKey]?.length ?? 0;
}

function getScatterYAxisColumn(
  data: ChartDataArtifact["value"],
  categoryColumn: string | null,
  xAxisColumn: string,
): string | undefined {
  return Object.keys(data).find(
    (columnName) => ![categoryColumn, xAxisColumn].includes(columnName),
  );
}

function getScatterCategoryValues(
  data: ChartDataArtifact["value"],
  categoryColumn: string | null,
): ScatterColumnValues | undefined {
  if (!categoryColumn) {
    return undefined;
  }
  return data[categoryColumn];
}

function getScatterChartColumns(
  data: ChartDataArtifact["value"],
  chartSettings: ScatterChartSettings,
): ScatterChartColumns | null {
  const rowCount = getScatterRowCount(data);
  if (!rowCount) {
    return null;
  }

  const xAxisColumn = chartSettings.xAxisColumn || getFirstColumnKey(data);
  if (!xAxisColumn) {
    return null;
  }

  const yAxisColumn = getScatterYAxisColumn(
    data,
    chartSettings.categoryColumn,
    xAxisColumn,
  );
  if (!yAxisColumn) {
    return null;
  }

  const xValues = data[xAxisColumn];
  const yValues = data[yAxisColumn];
  if (!xValues || !yValues) {
    return null;
  }

  return {
    categoryValues: getScatterCategoryValues(
      data,
      chartSettings.categoryColumn,
    ),
    rowCount,
    xValues,
    yAxisColumn,
    yValues,
  };
}

function groupScatterDataByCategory(
  columns: ScatterChartColumns,
): Record<string | number, ScatterPoint[]> {
  const groupedData: Record<string | number, ScatterPoint[]> = {};
  let categoryValue: string | number = "No Category";

  for (let index = 0; index < columns.rowCount; index++) {
    if (columns.categoryValues) {
      const nextCategoryValue = columns.categoryValues[index];
      if (nextCategoryValue === undefined) {
        throw new Error("Scatter chart category value is missing");
      }
      categoryValue = nextCategoryValue;
    }

    const x = columns.xValues[index];
    const y = columns.yValues[index];
    if (typeof x !== "number" || typeof y !== "number") {
      continue;
    }

    groupedData[categoryValue] ??= [];
    groupedData[categoryValue].push({ x, y });
  }

  return groupedData;
}

function getScatterDatasets(
  groupedData: Record<string | number, ScatterPoint[]>,
  datasetHidden: Record<string, boolean>,
): ScatterChartData["datasets"] {
  return Object.entries(groupedData).map(([category, points]) => ({
    label: category,
    data: points,
    yAxisID: "y",
    hidden: datasetHidden[category],
    pointRadius: 4,
    pointHoverRadius: 6,
  }));
}

function applyScatterChartScales(
  chart: Chart,
  darkMode: boolean,
  chartSettings: ScatterChartSettings,
) {
  chart.crosshairPlugin.color = darkMode ? "white" : "black";

  const scaleOptions = chart.options.scales;
  if (scaleOptions?.x) {
    scaleOptions.x.type = getAxisType(chartSettings.xAxisLog);
  }
  if (scaleOptions?.y) {
    scaleOptions.y.type = getAxisType(chartSettings.yAxisLog);
  }
}

export function updateScatterChartWithNewData(
  chart: Chart,
  data: ChartDataArtifact["value"],
  datasetHidden: Record<string, boolean>,
  darkMode: boolean,
  chartSettings: ScatterChartSettings,
): ScatterChartData {
  const columns = getScatterChartColumns(data, chartSettings);
  if (!columns) {
    return { datasets: [] };
  }

  const groupedData = groupScatterDataByCategory(columns);
  const datasets = getScatterDatasets(groupedData, datasetHidden);

  applyScatterChartScales(chart, darkMode, chartSettings);

  return { datasets };
}

const crosshairPlugin: Plugin<"scatter"> = {
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
      let nearestPoint: {
        x: number;
        y: number;
        xValue: number;
        yValue: number;
        datasetIndex: number;
        pointIndex: number;
      } | null = null;

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

        chart.tooltip?.setActiveElements(tooltipItems);
        chart.tooltip?.update();
      }
    } else {
      chart.crosshairPlugin = {
        ...chart.crosshairPlugin,
        x,
        y,
        draw: false,
      };
      chart.tooltip?.setActiveElements([], { x, y });
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
