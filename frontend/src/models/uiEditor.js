import { createProjectState } from "./utils";

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

export const useUIEditor = createProjectState((set) => ({
  tab: SECTION_CONFIG_TAB,
  setTab: (payload) => set(() => ({ tab: payload })),
}));
