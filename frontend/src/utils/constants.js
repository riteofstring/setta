import BASE_UI_TYPES from "constants/BaseUITypes.json";
import C from "constants/constants.json";

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
    URLS.BACKEND = `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}${C.ROUTE_PREFIX}`;
    URLS.WEBSOCKET = `ws://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}${C.ROUTE_PREFIX}`;
  } else {
    URLS.BACKEND = `http://${location.host}${C.ROUTE_PREFIX}`;
    URLS.WEBSOCKET = `ws://${location.host}${C.ROUTE_PREFIX}`;
  }

  for (const [k, v] of Object.entries(BASE_UI_TYPES)) {
    BASE_UI_TYPE_IDS[v.type] = k;
  }
}

export const CONST_INFO_VIEWS = {
  OVERVIEW: "Click on a section name to pan to it.",
  NAVBAR_SEARCH: "Search your entire project from one location.",
  BUTTON_GENERATE: "Generate command to run your project.",
  OVERVIEW_PROJNAME:
    "Your Project's Name and Config Name, editable all in one spot!",
  OVERVIEW_SEARCH: "Search through your project's cards.",
  SECTIONCONFIG_CARDTYPES_SEARCH:
    "Select your card's type. Options include: Object, List of Objects, Dictionary of Objects, and Info. The Info Card only takes in Markdown text.",
  SECTIONCONFIG_CONTENTS_SEARCH:
    "Choose which arguments appear in your selected card.",
};

export const initialShortcuts = {
  newCardShortcut: "",
  newGroupShortcut: "",
  typeCheckShortcut: "",
  newProjectConfigShortcut: "",
  undoShortcut: "Mod + Z",
  redoShortcut: "Mod + Shift + Z",
  groupShortcut: "Mod + G",
  saveShortcut: "Mod + S",
  saveAsShortcut: "Mod + Shift + S",
  loadShortcut: "Mod + L",
  focusOnArgsFilterShortcut: "Mod + K",
  resetZoomShortcut: "Mod + ,",
  copyShortcut: "Mod + C",
  pasteShortcut: "Mod + V",
  sortingShortcut: "Mod",
  movingFreeShortcut: "Alt",
};

export const jsonSettings = {
  defaultCodeSectionSize: { width: 500, height: "auto" },
  defaultTerminalSectionSize: { width: 700, height: "auto" },
  defaultSectionSize: { width: "auto", height: "auto" },
};

export const otherConfigurableSettings = {
  snapToGrid: false,
  snapGrid: [15, 15],
  minZoom: 0.1,
  maxZoom: 10,
};

export const SECTION_CONFIG_TAB = "SectionConfig";
export const UI_CONFIG_TAB = "UIConfig";
export const INFO_CONFIG_TAB = "InfoConfig";
export const RUNTIME_CONFIG_TAB = "RuntimeConfig";
export const DB_SOURCES_TAB = "DBSourcesConfig";

export const tabNameToPretty = Object.freeze(
  new Map(
    Object.entries({
      [UI_CONFIG_TAB]: "Parameters",
      [SECTION_CONFIG_TAB]: "Card",
      [INFO_CONFIG_TAB]: "Info",
      // [RUNTIME_CONFIG_TAB]: "Runtime",
      [DB_SOURCES_TAB]: "DB",
    }),
  ),
);

export const PROJECT_CONFIG_PREVIEW_IMG_COLORS = [
  "bg-red-500/60 dark:bg-red-600/30",
  "bg-pink-500/60 dark:bg-pink-600/30",
  "bg-purple-500/60 dark:bg-purple-600/30",
  "bg-indigo-500/60 dark:bg-indigo-600/30",
  "bg-blue-500/60 dark:bg-blue-600/30",
  "bg-green-500/60 dark:bg-green-600/30",
  "bg-yellow-500/60 dark:bg-yellow-600/30",
  "bg-orange-500/60 dark:bg-orange-600/30",
];

export const HOME_ROUTER_PATH = "/";
export const PROJECT_CONFIG_ROUTER_PATH = "/:projectConfigName";
export const SETTINGS_ROUTER_PATH = "/settings";

export const MODAL_PURPOSE = { LOAD: "LOAD", SAVE: "SAVE" };

export const MODAL_TYPE = {
  LOAD_PROJECT_CONFIG: {
    purpose: MODAL_PURPOSE.LOAD,
    title: "Load Project Config",
    buttonText: "Load",
  },
  SAVE_PROJECT_CONFIG_AS: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save Project Config As",
    buttonText: "Save As",
  },
  EXPORT_JSON: {
    purpose: null,
    title: "Export JSON",
    buttonText: null,
  },
  EXPORT_FULL_JSON: {
    purpose: null,
    title: "Export Full JSON",
    buttonText: null,
  },
  IMPORT_JSON: {
    purpose: null,
    title: "Import JSON",
    buttonText: "Import",
  },
  CREATE_FROM_ARGPARSE: {
    purpose: null,
    title: "Create From Argparse",
    buttonText: "Create",
  },
  LOAD_SECTION: {
    purpose: MODAL_PURPOSE.LOAD,
    title: "Load Section",
    buttonText: "Load",
  },
  SAVE_UI_TYPE_CONFIG: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save UI Type Config",
    buttonText: "Save",
  },
  SAVE_CUSTOM_ARGUMENTS: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save Custom Arguments",
    buttonText: "Save",
  },
  NEW_VERSION: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save New Version",
    buttonText: "Save",
  },
  NEW_PARAM_SWEEP: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save New Param Sweep",
    buttonText: "Save",
  },
};
