import type { Dimensions, Transform } from "../types";

export const REACT_FLOW_SCROLL_INIT = 5000;

const DEFAULT_REACT_FLOW_DIMENSION = 500;
const DEFAULT_LIGHT_WIRE_COLOR = "#41506c";
const DEFAULT_DARK_WIRE_COLOR = "#bac2d3";

export type ReactFlowGuiSettings = {
  wireColor?: string;
  wireColorDarkMode?: string;
};

export type ReactFlowScrollPlan = {
  deltaX: number;
  deltaY: number;
  resetScrollLeft: number;
  resetScrollTop: number;
};

export function resolveReactFlowWireColor({
  gui,
  darkMode,
}: {
  gui: ReactFlowGuiSettings | null | undefined;
  darkMode: boolean;
}): string {
  const light = gui?.wireColor ?? DEFAULT_LIGHT_WIRE_COLOR;
  const dark = gui?.wireColorDarkMode ?? DEFAULT_DARK_WIRE_COLOR;
  return darkMode ? dark : light;
}

export function shouldRenderReactFlowContents(
  wrapperDimensions: Dimensions,
): boolean {
  return wrapperDimensions.height > 0 && wrapperDimensions.width > 0;
}

export function buildReactFlowStoreDimensions({
  wrapperDimensions,
  overviewWidth,
  uiEditorWidth,
}: {
  wrapperDimensions: Dimensions;
  overviewWidth: number;
  uiEditorWidth: number;
}): Dimensions {
  return {
    width:
      wrapperDimensions.width - overviewWidth - uiEditorWidth ||
      DEFAULT_REACT_FLOW_DIMENSION,
    height: wrapperDimensions.height || DEFAULT_REACT_FLOW_DIMENSION,
  };
}

export function buildReactFlowScrollPlan({
  initialized,
  scrollLeft,
  scrollTop,
  transform,
}: {
  initialized: boolean;
  scrollLeft: number;
  scrollTop: number;
  transform: Transform;
}): ReactFlowScrollPlan | null {
  if (!initialized) {
    return null;
  }

  return {
    deltaX: -(scrollLeft - REACT_FLOW_SCROLL_INIT) / transform[2],
    deltaY: -(scrollTop - REACT_FLOW_SCROLL_INIT) / transform[2],
    resetScrollLeft: REACT_FLOW_SCROLL_INIT,
    resetScrollTop: REACT_FLOW_SCROLL_INIT,
  };
}
