import { describe, expect, it } from "vitest";
import {
  buildReactFlowScrollPlan,
  buildReactFlowStoreDimensions,
  resolveReactFlowWireColor,
  REACT_FLOW_SCROLL_INIT,
  shouldRenderReactFlowContents,
} from "./reactFlowView";

describe("resolveReactFlowWireColor", () => {
  it("uses explicit light and dark colors when the backend provides them", () => {
    // Preserve the existing theme-specific wire colors when both values exist.
    expect(
      resolveReactFlowWireColor({
        gui: {
          wireColor: "#123456",
          wireColorDarkMode: "#abcdef",
        },
        darkMode: false,
      }),
    ).toBe("#123456");
    expect(
      resolveReactFlowWireColor({
        gui: {
          wireColor: "#123456",
          wireColorDarkMode: "#abcdef",
        },
        darkMode: true,
      }),
    ).toBe("#abcdef");
  });

  it("falls back to the legacy defaults when older backend fields are missing", () => {
    // Older builds can omit these settings entirely, so the fallback must stay stable.
    expect(
      resolveReactFlowWireColor({
        gui: {},
        darkMode: false,
      }),
    ).toBe("#41506c");
    expect(
      resolveReactFlowWireColor({
        gui: null,
        darkMode: true,
      }),
    ).toBe("#bac2d3");
  });
});

describe("shouldRenderReactFlowContents", () => {
  it("renders only after both wrapper dimensions are positive", () => {
    // Keep the renderer gated until ResizeObserver has produced a usable box.
    expect(
      shouldRenderReactFlowContents({
        width: 0,
        height: 400,
      }),
    ).toBe(false);
    expect(
      shouldRenderReactFlowContents({
        width: 800,
        height: 0,
      }),
    ).toBe(false);
    expect(
      shouldRenderReactFlowContents({
        width: 800,
        height: 600,
      }),
    ).toBe(true);
  });
});

describe("buildReactFlowStoreDimensions", () => {
  it("subtracts the overview and editor panes from the observed wrapper width", () => {
    // The xyflow store should continue seeing the drawable canvas width, not the full wrapper width.
    expect(
      buildReactFlowStoreDimensions({
        wrapperDimensions: { width: 1200, height: 700 },
        overviewWidth: 220,
        uiEditorWidth: 180,
      }),
    ).toEqual({
      width: 800,
      height: 700,
    });
  });

  it("falls back to the legacy default dimensions when ResizeObserver reports zero", () => {
    // Preserve the existing zero-dimension fallback used during initial layout churn.
    expect(
      buildReactFlowStoreDimensions({
        wrapperDimensions: { width: 300, height: 0 },
        overviewWidth: 200,
        uiEditorWidth: 100,
      }),
    ).toEqual({
      width: 500,
      height: 500,
    });
  });
});

describe("buildReactFlowScrollPlan", () => {
  it("does nothing until the initial scroll reset has completed", () => {
    // Scroll events fired before initialization should not translate the viewport yet.
    expect(
      buildReactFlowScrollPlan({
        initialized: false,
        scrollLeft: REACT_FLOW_SCROLL_INIT + 80,
        scrollTop: REACT_FLOW_SCROLL_INIT + 40,
        transform: [0, 0, 2],
      }),
    ).toBeNull();
  });

  it("converts scroll deltas back into zoom-aware viewport pan deltas", () => {
    // Keep browser scroll behavior mapped to the same canvas pan distance at the current zoom.
    expect(
      buildReactFlowScrollPlan({
        initialized: true,
        scrollLeft: REACT_FLOW_SCROLL_INIT + 120,
        scrollTop: REACT_FLOW_SCROLL_INIT - 60,
        transform: [10, 20, 2],
      }),
    ).toEqual({
      deltaX: -60,
      deltaY: 30,
      resetScrollLeft: REACT_FLOW_SCROLL_INIT,
      resetScrollTop: REACT_FLOW_SCROLL_INIT,
    });
  });
});
