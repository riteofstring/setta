import { localStorageFns } from "state/hooks/localStorage";

export function toggleDarkMode() {
  const [value, setValue] = localStorageFns.darkMode.state();
  setValue(!value);
}

export function toggleMiniMap() {
  const [value, setValue] = localStorageFns.showMinimap.state();
  setValue(!value);
}

export function toggleProjectConfigPreviewEnabled() {
  const [value, setValue] = localStorageFns.projectConfigPreviewEnabled.state();
  setValue(!value);
}
