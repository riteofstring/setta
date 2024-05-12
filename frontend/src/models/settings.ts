import { create } from "./utils";

export const initialShortcuts = {
  undoShortcut: "ctrl+z",
  redoShortcut: "ctrl+shift+z",
  groupShortcut: "ctrl+g",
  saveShortcut: "ctrl+s",
  saveAsShortcut: "ctrl+shift+s",
  loadShortcut: "ctrl+l",
  focusOnArgsFilterShortcut: "ctrl+k",
  resetZoomShortcut: "ctrl+,",
  copyShortcut: "ctrl+c",
  pasteShortcut: "ctrl+v",
  sortingShortcut: "ctrl",
  movingFreeShortcut: "alt",
};

export const jsonSettings = {
  defaultCodeSectionSize: { width: 500, height: "auto" },
  defaultTerminalSectionSize: { width: 700, height: "auto" },
  defaultSectionSize: { width: "auto", height: "auto" },
};

export const otherConfigurableSettings = {
  snapToGrid: false,
  snapGrid: [15, 15],
};

const initialState = {
  settingsLoaded: false,
  darkMode: false,
  showMiniMap: true,
  ...jsonSettings,
  ...otherConfigurableSettings,
  ...initialShortcuts,
};

export const useSettings = create((set) => ({
  ...initialState,
  setSettings: (payload) => set({ ...payload, settingsLoaded: true }),
  toggleSetting: (settingName) =>
    set((state) => ({ [settingName]: !state[settingName] })),
}));
