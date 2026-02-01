import { useLocalStorage } from "state/definitions";

export function toggleDarkMode() {
  useLocalStorage.setState((state) => ({ darkMode: !state.darkMode }));
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
