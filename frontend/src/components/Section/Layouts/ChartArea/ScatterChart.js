import { Tooltip } from "chart.js";

Tooltip.positioners.scatterChartTooltipMousePosition = function (
  elements,
  eventPosition,
) {
  if (!eventPosition) {
    return false;
  }
  return { x: eventPosition.x, y: eventPosition.y };
};

export function getScatterChartOptionsAndPlugins() {
  return {
    type: "scatter",
    plugins: [crosshairPlugin],
    options: {
      plugins: {
        tooltip: {
          enabled: true,
          mode: "nearest",
          intersect: false,
          position: "scatterChartTooltipMousePosition",
          callbacks: {
            title: (context) => {
              const point = context[0];
              return `(${point.parsed.x.toFixed(2)}, ${point.parsed.y.toFixed(2)})`;
            },
            label: (context) => {
              const label = context.dataset.label || "";
              return label;
            },
          },
        },
      },
    },
  };
}

export function updateScatterChartWithNewData({
  chartRef,
  artifactData,
  datasetHidden,
  darkMode,
  chartSettings,
}) {
  const xColumnIndex = artifactData.headers.indexOf(chartSettings.xAxisColumn);
  const categoryColumnIndex = artifactData.headers.indexOf(
    chartSettings.categoryColumn,
  );

  // Group data by category values
  const groupedData = {};
  for (const row of artifactData.data) {
    const categoryValue = row[categoryColumnIndex];
    if (!groupedData[categoryValue]) {
      groupedData[categoryValue] = [];
    }
    for (let i = 0; i < row.length; i++) {
      if (i === xColumnIndex) continue;
      if (i === categoryColumnIndex) continue;
      groupedData[categoryValue].push({
        x: row[xColumnIndex],
        y: row[i],
        columnName: artifactData.headers[i],
      });
    }
  }

  // Create dataset for each category
  const datasets = Object.entries(groupedData).map(([category, points]) => ({
    label: category,
    data: points,
    yAxisID: chartSettings.secondYAxisColumns.includes(points[0]?.columnName)
      ? "y2"
      : "y1",
    hidden: datasetHidden[category],
    pointRadius: 4,
    pointHoverRadius: 6,
  }));

  chartRef.current.crosshairPlugin.color = darkMode ? "white" : "black";

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
