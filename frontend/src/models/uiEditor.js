import { createProjectState } from "./utils";

export const SECTION_CONFIG_TAB = "SectionConfig";
export const UI_CONFIG_TAB = "UIConfig";
export const INFO_CONFIG_TAB = "InfoConfig";
export const RUNTIME_CONFIG_TAB = "RuntimeConfig";

export const tabNameToPretty = Object.freeze(
  new Map(
    Object.entries({
      [SECTION_CONFIG_TAB]: "Card",
      [UI_CONFIG_TAB]: "Parameters",
      [INFO_CONFIG_TAB]: "Info",
      [RUNTIME_CONFIG_TAB]: "Runtime",
    })
  )
);

export const useUIEditor = createProjectState((set) => ({
  tab: SECTION_CONFIG_TAB,
  cameFromUIConfig: false,
  setTab: (payload) => set(() => ({ tab: payload })),
  setCameFromUIConfig: (payload) => set(() => ({ cameFromUIConfig: payload })),
}));
