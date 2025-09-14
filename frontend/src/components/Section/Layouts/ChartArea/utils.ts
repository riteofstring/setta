import { ChartType, LegendOptions, TooltipPositionerFunction } from "chart.js";

declare module "chart.js" {
  interface TooltipPositionerMap {
    lineChartTooltipMousePosition: TooltipPositionerFunction<"line">;
    scatterChartTooltipMousePosition: TooltipPositionerFunction<"scatter">;
  }
}

export type SetDatasetHiddenFn = React.Dispatch<
  React.SetStateAction<Record<string, boolean>>
>;

export function getOnLegendClickSetDatasetHidden<T extends ChartType>(
  setDatasetHidden: SetDatasetHiddenFn,
): LegendOptions<T>["onClick"] {
  return (_evt, legendItem) => {
    setDatasetHidden((prev) => ({
      ...prev,
      [legendItem.text]: !prev[legendItem.text],
    }));
  };
}
