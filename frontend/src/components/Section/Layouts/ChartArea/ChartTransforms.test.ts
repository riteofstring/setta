import { Chart } from "chart.js";
import {
  createLineChartSettings,
  ScatterChartSettings,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { updateLineChartWithNewData } from "./LineChart";
import { updateScatterChartWithNewData } from "./ScatterChart";

function createMockLineChart(): Chart {
  return {
    options: {
      scales: {
        x: {},
        y1: {},
        y2: {},
      },
    },
    verticalLinePlugin: {
      color: "black",
    },
  } as unknown as Chart;
}

function createMockScatterChart(): Chart {
  return {
    options: {
      scales: {
        x: {},
        y: {},
      },
    },
    crosshairPlugin: {
      color: "black",
    },
  } as unknown as Chart;
}

function createScatterChartSettings(
  options: Partial<ScatterChartSettings> = {},
): ScatterChartSettings {
  return {
    categoryColumn: "series",
    type: "scatter",
    xAxisColumn: "time",
    xAxisLog: false,
    yAxisLog: false,
    ...options,
  };
}

describe("chart transforms", () => {
  it("builds line chart datasets from the configured axis columns", () => {
    const chart = createMockLineChart();

    const result = updateLineChartWithNewData(
      chart,
      {
        pressure: [100, 101],
        temp: [10, 12],
        time: [0, 1],
      },
      { pressure: true },
      true,
      createLineChartSettings({
        secondYAxisColumns: ["pressure"],
        xAxisColumn: "time",
        y1AxisLog: true,
      }),
    );

    expect(result).toEqual({
      labels: [0, 1],
      datasets: [
        {
          label: "pressure",
          data: [100, 101],
          yAxisID: "y2",
          hidden: true,
        },
        {
          label: "temp",
          data: [10, 12],
          yAxisID: "y1",
          hidden: undefined,
        },
      ],
    });
    expect(chart.verticalLinePlugin.color).toBe("white");
    expect(chart.options.scales?.x?.type).toBe("linear");
    expect(chart.options.scales?.y1?.type).toBe("logarithmic");
    expect(chart.options.scales?.y2?.display).toBe(true);
  });

  it("falls back to row indices when the line chart has no x-axis column", () => {
    const chart = createMockLineChart();

    const result = updateLineChartWithNewData(
      chart,
      {
        first: [1, 2],
        second: [3, 4],
      },
      {},
      false,
      createLineChartSettings({ xAxisColumn: null }),
    );

    expect(result).toEqual({
      labels: [0, 1],
      datasets: [
        {
          label: "first",
          data: [1, 2],
          yAxisID: "y1",
          hidden: undefined,
        },
        {
          label: "second",
          data: [3, 4],
          yAxisID: "y1",
          hidden: undefined,
        },
      ],
    });
    expect(chart.options.scales?.y2?.display).toBe(false);
  });

  it("groups scatter points by category and skips non-numeric points", () => {
    const chart = createMockScatterChart();

    const result = updateScatterChartWithNewData(
      chart,
      {
        series: ["A", "A", "B"],
        time: [0, 1, 2],
        value: [10, "bad", 15],
      },
      { B: true },
      true,
      createScatterChartSettings({ yAxisLog: true }),
    );

    expect(result).toEqual({
      datasets: [
        {
          label: "A",
          data: [{ x: 0, y: 10 }],
          yAxisID: "y",
          hidden: undefined,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "B",
          data: [{ x: 2, y: 15 }],
          yAxisID: "y",
          hidden: true,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    });
    expect(chart.crosshairPlugin.color).toBe("white");
    expect(chart.options.scales?.x?.type).toBe("linear");
    expect(chart.options.scales?.y?.type).toBe("logarithmic");
  });

  it("returns no scatter datasets when there is no remaining y-axis column", () => {
    const chart = createMockScatterChart();

    const result = updateScatterChartWithNewData(
      chart,
      {
        series: ["A", "B"],
        time: [0, 1],
      },
      {},
      false,
      createScatterChartSettings(),
    );

    expect(result).toEqual({ datasets: [] });
  });
});
