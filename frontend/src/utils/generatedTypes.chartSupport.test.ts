import { describe, expect, it } from "vitest";
import {
  ChartTypeEnum,
  SectionTypeEnum,
  createBaseChartSettingsUnionWithDiscriminator,
  createChartSectionImpl,
  createLineChartSettings,
  createScatterChartSettings,
  createUserDefaultChartSectionImpl,
} from "utils/generatedTypes";

describe("generated chart support", () => {
  it("exports canonical chart type enums and settings factories", () => {
    const lineSettings = createLineChartSettings({
      xAxisColumn: "time",
      secondYAxisColumns: ["humidity"],
      xAxisLog: true,
    });
    const scatterSettings = createScatterChartSettings({
      categoryColumn: "series",
      yAxisLog: true,
    });

    expect(ChartTypeEnum.line).toBe("line");
    expect(ChartTypeEnum.scatter).toBe("scatter");
    expect(lineSettings.type).toBe(ChartTypeEnum.line);
    expect(lineSettings.secondYAxisColumns).toEqual(["humidity"]);
    expect(scatterSettings.type).toBe(ChartTypeEnum.scatter);
    expect(scatterSettings.categoryColumn).toBe("series");
  });

  it("builds discriminated chart settings and chart section impls", () => {
    const chartSettings = createBaseChartSettingsUnionWithDiscriminator({
      type: ChartTypeEnum.scatter,
      xAxisColumn: "time",
      categoryColumn: "series",
      yAxisLog: true,
    });
    const chartImpl = createChartSectionImpl(
      createUserDefaultChartSectionImpl({
        dataPath: "artifacts/chart.csv",
      }),
      {
        id: "chart-impl",
        chartSettings,
      },
    );

    expect(chartImpl.type).toBe(SectionTypeEnum.Chart);
    expect(chartImpl.id).toBe("chart-impl");
    expect(chartImpl.dataPath).toBe("artifacts/chart.csv");
    expect(chartImpl.chartSettings.type).toBe(ChartTypeEnum.scatter);
    if (chartImpl.chartSettings.type !== ChartTypeEnum.scatter) {
      throw new Error("expected scatter chart settings");
    }
    expect(chartImpl.chartSettings.categoryColumn).toBe("series");
    expect(chartImpl.size).toEqual({ width: 300, height: 300 });
  });
});
