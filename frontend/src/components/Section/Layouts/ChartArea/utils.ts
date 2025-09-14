import { ChartType, LegendOptions, TooltipPositionerFunction } from "chart.js";

declare module "chart.js" {
  interface TooltipPositionerMap {
    lineChartTooltipMousePosition: TooltipPositionerFunction<"line">;
    scatterChartTooltipMousePosition: TooltipPositionerFunction<"scatter">;
  }

  interface Chart {
    verticalLinePlugin: VerticalLinePluginState;
    crosshairPlugin: CrosshairPluginState;
  }
}

// Type for the vertical line plugin state
interface VerticalLinePluginState {
  x: number;
  y: number;
  draw: boolean;
  width: number;
  color: string;
  dash: number[];
}

// Type for the crosshair plugin state
interface CrosshairPluginState {
  x: number;
  y: number;
  xValue: number;
  yValue: number;
  draw: boolean;
  width: number;
  color: string;
  dash: number[];
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

export function getAxisType(isLog: boolean, sampleData?: string | number) {
  if (typeof sampleData === "string") {
    return "category";
  }
  return isLog ? "logarithmic" : "linear";
}
