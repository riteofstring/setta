import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "@riteofstring/setta";
import {
  BarChart,
  HeatmapChart,
  LineChart,
  ParallelChart,
  ScatterChart,
} from "echarts/charts";
import {
  AriaComponent,
  AxisPointerComponent,
  BrushComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ParallelComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import {
  init,
  use as registerECharts,
  type ECharts,
  type EChartsCoreOption,
} from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

registerECharts([
  AriaComponent,
  AxisPointerComponent,
  BarChart,
  BrushComponent,
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  HeatmapChart,
  LegendComponent,
  LineChart,
  MarkLineComponent,
  ParallelChart,
  ParallelComponent,
  ScatterChart,
  TooltipComponent,
  VisualMapComponent,
]);

type EChartEventHandlers = Readonly<
  Record<string, (event: unknown, chart: ECharts) => void>
>;

export type LensChart = ECharts;

export type EChartSurfaceHandle = Readonly<{
  getChart: () => LensChart | null;
}>;

type EChartPointerEvent = Readonly<{
  offsetX?: number;
  offsetY?: number;
  zrX?: number;
  zrY?: number;
}>;

export type EChartPointerHandler = (
  event: EChartPointerEvent,
  chart: ECharts,
) => void;

export type EChartSurfaceProps = Readonly<{
  ariaLabel: string;
  className?: string;
  events?: EChartEventHandlers;
  onPointer?: EChartPointerHandler;
  option: EChartsCoreOption;
  ownsWheel?: boolean;
}>;

export const EChartSurface = forwardRef<
  EChartSurfaceHandle,
  EChartSurfaceProps
>(function EChartSurface(
  {
    ariaLabel,
    className = "",
    events = {},
    onPointer,
    option,
    ownsWheel = false,
  },
  forwardedRef,
) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  useImperativeHandle(
    forwardedRef,
    () => ({ getChart: () => chartRef.current }),
    [],
  );

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    const chart = init(element, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const registered = Object.entries(events).map(([name, handler]) => {
      const listener = (event: unknown) => handler(event, chart);
      chart.on(name, listener);
      return { listener, name };
    });
    return () => {
      for (const { listener, name } of registered) {
        chart.off(name, listener);
      }
    };
  }, [events]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onPointer) {
      return;
    }
    const element = elementRef.current;
    let frame = 0;
    const surfaceListener = (event: MouseEvent) => {
      if (!element) {
        return;
      }
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }
      const point = {
        offsetX:
          (event.clientX - bounds.left) * (chart.getWidth() / bounds.width),
        offsetY:
          (event.clientY - bounds.top) * (chart.getHeight() / bounds.height),
      };
      frame = requestAnimationFrame(() => {
        if (!chart.isDisposed()) {
          onPointer(point, chart);
        }
      });
    };
    element?.addEventListener("click", surfaceListener, true);
    return () => {
      cancelAnimationFrame(frame);
      element?.removeEventListener("click", surfaceListener, true);
    };
  }, [onPointer]);

  return (
    <div
      aria-label={ariaLabel}
      className={`lens-echart ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${ownsWheel ? NO_WHEEL_CLASS_NAME : ""} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${className}`}
      data-lens-chart="true"
      ref={elementRef}
      role="img"
    />
  );
});
