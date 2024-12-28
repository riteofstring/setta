import Chart from "chart.js/auto";

export function getLineChartOptionsAndPlugins({
  secondYAxisColumns,
  setDatasetHidden,
}) {
  return {
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
      },
    },
  };
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
