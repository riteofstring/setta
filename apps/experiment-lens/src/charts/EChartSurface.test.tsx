import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chart = {
    dispose: vi.fn(),
    getHeight: vi.fn(() => 200),
    getWidth: vi.fn(() => 400),
    isDisposed: vi.fn(() => false),
    off: vi.fn(),
    on: vi.fn(),
    resize: vi.fn(),
    setOption: vi.fn(),
  };
  return { chart, init: vi.fn(() => chart), use: vi.fn() };
});

vi.mock("echarts/core", () => ({
  init: mocks.init,
  use: mocks.use,
}));
vi.mock("echarts/charts", () => ({
  LineChart: {},
  ParallelChart: {},
  ScatterChart: {},
}));
vi.mock("echarts/components", () => ({
  AriaComponent: {},
  AxisPointerComponent: {},
  BrushComponent: {},
  DataZoomComponent: {},
  GridComponent: {},
  LegendComponent: {},
  MarkLineComponent: {},
  ParallelComponent: {},
  TooltipComponent: {},
}));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));

import { EChartSurface } from "./EChartSurface";

describe("EChartSurface", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("owns option, semantic, pointer, and disposal lifecycle", () => {
    const click = vi.fn();
    const pointer = vi.fn();
    act(() => {
      root.render(
        <EChartSurface
          ariaLabel="Population chart"
          events={{ click }}
          onPointer={pointer}
          option={{ series: [] }}
        />,
      );
    });

    expect(mocks.init).toHaveBeenCalledOnce();
    expect(mocks.chart.setOption).toHaveBeenCalledWith(
      { series: [] },
      { notMerge: true },
    );
    expect(mocks.chart.on).toHaveBeenCalledWith("click", expect.any(Function));
    expect(
      container.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ).toBe("Population chart");

    act(() => root.unmount());
    expect(mocks.chart.dispose).toHaveBeenCalledOnce();
    expect(mocks.chart.off).toHaveBeenCalledWith("click", expect.any(Function));
    root = createRoot(container);
  });
});
