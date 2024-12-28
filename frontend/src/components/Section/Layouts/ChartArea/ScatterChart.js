import { Tooltip } from "chart.js";
import Chart from "chart.js/auto";

Tooltip.positioners.scatterChartTooltipMousePosition = function (
  elements,
  eventPosition,
) {
  if (!eventPosition) {
    return false;
  }
  return { x: eventPosition.x, y: eventPosition.y };
};

export function getScatterChartOptionsAndPlugins({ setDatasetHidden }) {
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
            Chart.defaults.plugins.legend.onClick(evt, legendItem, legend);
          },
        },
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
      onHover: () => {}, // Empty callback to ensure hover state is always active
    },
  };
}

export function updateScatterChartWithNewData({
  chartRef,
  artifactData,
  xAxisColumn,
  secondYAxisColumns,
  datasetHidden,
  darkMode,
}) {
  const xColumnIndex = artifactData.headers.indexOf(xAxisColumn);
  const datasets = [];

  // Create datasets for each y-axis column
  for (let i = 0; i < artifactData.headers.length; i++) {
    if (i === xColumnIndex) continue;
    datasets.push({
      label: artifactData.headers[i],
      data: [],
      yAxisID: secondYAxisColumns.includes(artifactData.headers[i])
        ? "y2"
        : "y1",
      hidden: datasetHidden[artifactData.headers[i]],
      pointRadius: 4,
      pointHoverRadius: 6,
    });
  }

  // Populate datasets with x,y coordinates
  for (const row of artifactData.data) {
    let datasetIndex = 0;
    for (let i = 0; i < row.length; i++) {
      if (i === xColumnIndex) continue;
      datasets[datasetIndex].data.push({
        x: row[xColumnIndex],
        y: row[i],
      });
      datasetIndex++;
    }
  }

  const newData = { datasets };

  chartRef.current.data = newData;
  chartRef.current.crosshairPlugin.color = darkMode ? "white" : "black";
  chartRef.current.scales.y2.display = secondYAxisColumns.length > 0;
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
