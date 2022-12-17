import { create } from "./utils";

export const SECTION_CONFIG_TAB = "SectionConfig";
export const UI_CONFIG_TAB = "UIConfig";

export const useUIEditor = create((set) => ({
  tab: SECTION_CONFIG_TAB,
  cameFromUIConfig: false,
  setTab: (payload) => set(() => ({ tab: payload })),
  setCameFromUIConfig: (payload) => set(() => ({ cameFromUIConfig: payload })),
}));
