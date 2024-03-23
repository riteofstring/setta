export const NO_CONTEXT_MENU = import.meta.env.MODE === "ncm";
export const SECTIONWIDTH = 250;
export const PANEID = "-1";
export const OVERVIEW = "overview";
export const UI_EDITOR = "uiEditor";

export const CLOSED_PANE_WIDTH = 40;
export const INITIAL_CHART_SIZE = { width: SECTIONWIDTH, height: SECTIONWIDTH };

export const REACT_FLOW_STORE = {
  initialViewport: {},
  lastPaneClickLocation: {},
};

export const SINGLETON_SECTIONS = {
  globalVariables: null,
  globalParamSweep: null,
  varControl: null,
};


// initial section sizes
export const CODE_SECTION_SIZE = {width: 500, height: "auto"}
export const TERMINAL_SECTION_SIZE = {width: 700, height: "auto"}
