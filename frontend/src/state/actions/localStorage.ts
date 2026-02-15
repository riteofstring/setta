import {
  type ColorModePreference,
  type HomeProjectGalleryViewMode,
  useLocalStorage,
} from "state/definitions";

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

export function toggleAgenticEdges() {
  useLocalStorage.setState((state) => ({
    showAgenticEdges: !state.showAgenticEdges,
  }));
}

export function toggleArgEdges() {
  useLocalStorage.setState((state) => ({
    showArgEdges: !state.showArgEdges,
  }));
}

export function setHomeProjectGalleryViewMode(
  viewMode: HomeProjectGalleryViewMode,
) {
  useLocalStorage.setState({ homeProjectGalleryViewMode: viewMode });
}

export function toggleFavoriteProjectConfig(projectConfigId: string) {
  useLocalStorage.setState((state) => {
    const current = state.favoriteProjectConfigIds;
    if (current.includes(projectConfigId)) {
      return {
        favoriteProjectConfigIds: current.filter(
          (id) => id !== projectConfigId,
        ),
      };
    }
    return { favoriteProjectConfigIds: [...current, projectConfigId] };
  });
}

export function setOverviewProjectConfigOrder(orderedIds: string[]) {
  useLocalStorage.setState({ overviewProjectConfigOrder: orderedIds });
}
