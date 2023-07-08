export const NO_AUTH = ["sna", "snancm"].includes(import.meta.env.MODE);
export const NO_CONTEXT_MENU = import.meta.env.MODE === "snancm";
export const SECTIONWIDTH = 450;
export const NAVBAR_HEIGHT = 48;
export const PANEID = "-1";
export const OVERVIEW = "overview";
export const UI_EDITOR = "uiEditor";

export const CLOSED_PANE_WIDTH = 40;
export const INITIAL_CHART_SIZE = { width: SECTIONWIDTH, height: SECTIONWIDTH };
