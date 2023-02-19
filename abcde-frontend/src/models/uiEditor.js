import { create } from "./utils";

export const SECTION_CONFIG_TAB = "SectionConfig";
export const UI_CONFIG_TAB = "UIConfig";
export const INFO_CONFIG_TAB = "InfoConfig";

export const tabNameToPretty = Object.freeze(
  new Map(
    Object.entries({
      [SECTION_CONFIG_TAB]: "Card",
      [UI_CONFIG_TAB]: "Parameters",
      [INFO_CONFIG_TAB]: "Info",
    })
  )
);

export const useUIEditor = create((set) => ({
  tab: SECTION_CONFIG_TAB,
  cameFromUIConfig: false,
  setTab: (payload) => set(() => ({ tab: payload })),
  setCameFromUIConfig: (payload) => set(() => ({ cameFromUIConfig: payload })),
}));
