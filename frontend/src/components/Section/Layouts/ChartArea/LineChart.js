import { Tooltip } from "chart.js";

Tooltip.positioners.lineChartTooltipMousePosition = function (
  elements,
  eventPosition,
) {
  return { x: eventPosition.x, y: eventPosition.y };
};

export function getLineChartOptionsAndPlugins({ setDatasetHidden }) {
  return {
    type: "line",
    data: {
      datasets: [],
    },
    plugins: [verticalLinePlugin],
    options: {
      spanGaps: true,
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
          position: "lineChartTooltipMousePosition",
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
      },
    },
  };
}

export function updateLineChartWithNewData({
  chartRef,
  artifactData,
  xAxisColumn,
  secondYAxisColumns,
  datasetHidden,
  darkMode,
  chartSettings,
}) {
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
  chartRef.current.verticalLinePlugin.color = darkMode ? "white" : "black";
}

const verticalLinePlugin = {
  id: "verticalLinePlugin",
  afterInit: (chart) => {
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
