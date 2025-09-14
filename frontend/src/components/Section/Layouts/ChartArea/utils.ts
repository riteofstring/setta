import {
  Chart,
  ChartType,
  LegendOptions,
  TooltipPositionerFunction,
} from "chart.js";

declare module "chart.js" {
  interface TooltipPositionerMap {
    lineChartTooltipMousePosition: TooltipPositionerFunction<"line">;
    scatterChartTooltipMousePosition: TooltipPositionerFunction<"scatter">;
  }
}

export function getOnLegendClickSetDatasetHidden<T extends ChartType>(
  setDatasetHidden: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >,
): LegendOptions<T>["onClick"] {
  return (evt, legendItem, legend) => {
    setDatasetHidden((prev) => ({
      ...prev,
      [legendItem.text]: !prev[legendItem.text],
    }));
    Chart.defaults.plugins.legend.onClick.call(legend, evt, legendItem, legend);
  };
}
