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

const initialState = {
  settingsLoaded: false,
  darkMode: false,
  snapToGrid: false,
  snapGrid: [15, 15],
  ...initialShortcuts,
};

export const useSettings = create((set) => ({
  ...initialState,
  setSettings: (payload) => set({ ...payload, settingsLoaded: true }),
  toggleSetting: (settingName) =>
    set((state) => ({ [settingName]: !state[settingName] })),
}));
