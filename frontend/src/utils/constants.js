import BASE_UI_TYPES from "constants/BaseUITypes.json";
import C from "constants/constants.json"

export const NO_CONTEXT_MENU = import.meta.env.MODE === "ncm";
export const SECTIONWIDTH = 200;
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

// If multiple db sources map to the same db, then this holds that mapping.
// For example, if "settings" points to the same db as "default"
// the mapping would be {settings: "default", default: "default"}
export const DB_SOURCE_MAPPING = {};

export function setDbSourceMapping(newMapping) {
  const keys = Object.keys(DB_SOURCE_MAPPING);
  for (const k of keys) {
    delete DB_SOURCE_MAPPING[k];
  }
  for (const [k, v] of Object.entries(newMapping)) {
    DB_SOURCE_MAPPING[k] = v;
  }
}

// constants object
export const URLS = {};
export const BASE_UI_TYPE_IDS = {};

export function globalConstInit() {
  const DEV_MODE = import.meta.env.DEV;
  if (DEV_MODE) {
    URLS.BACKEND = `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
    URLS.WEBSOCKET = `ws://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
  } else {
    URLS.BACKEND = `http://${location.host}`;
    URLS.WEBSOCKET = `ws://${location.host}`;
  }

  for (const [k, v] of Object.entries(BASE_UI_TYPES)) {
    BASE_UI_TYPE_IDS[v.type] = k;
  }
}
