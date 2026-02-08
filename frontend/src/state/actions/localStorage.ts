import { type ColorModePreference, useLocalStorage } from "state/definitions";

export function setColorModePreference(colorMode: ColorModePreference) {
  useLocalStorage.setState((state) => ({
    colorMode,
    darkMode: colorMode === "auto" ? state.darkMode : colorMode === "dark",
  }));
}

export function toggleMiniMap() {
  useLocalStorage.setState((state) => ({ showMinimap: !state.showMinimap }));
}

export function toggleProjectConfigPreviewEnabled() {
  useLocalStorage.setState((state) => ({
    projectConfigPreviewEnabled: !state.projectConfigPreviewEnabled,
  }));
}

export function toggleSnapToGrid() {
  useLocalStorage.setState((state) => ({ snapToGrid: !state.snapToGrid }));
}
