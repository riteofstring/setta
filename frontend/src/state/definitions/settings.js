import { create } from "./utils";

export const initialShortcuts = {
  undoShortcut: "mod+z",
  redoShortcut: "mod+shift+z",
  groupShortcut: "mod+g",
  saveShortcut: "mod+s",
  saveAsShortcut: "mod+shift+s",
  loadShortcut: "mod+l",
  focusOnArgsFilterShortcut: "mod+k",
  resetZoomShortcut: "mod+,",
  copyShortcut: "mod+c",
  pasteShortcut: "mod+v",
  sortingShortcut: "mod",
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
  ...jsonSettings,
  ...otherConfigurableSettings,
  ...initialShortcuts,
};

export const useSettings = create(() => ({
  ...initialState,
}));
