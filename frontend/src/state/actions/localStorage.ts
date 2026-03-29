import { setPaneWidthWithLayout } from "components/Panes/paneLayout";
import {
  type ColorModePreference,
  type HomeProjectGalleryViewMode,
  useLocalStorage,
} from "state/definitions";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  OverviewTabNameEnum,
  PaneNameEnum,
} from "utils/constants";
import { dedupeStringIds } from "utils/dedupeStringIds";
import type { ChatSharedEdgeMode } from "./chatSharedHandleIds";

export function setColorModePreference(colorMode: ColorModePreference) {
  useLocalStorage.setState((state) => ({
    colorMode,
    darkMode: colorMode === "auto" ? state.darkMode : colorMode === "dark",
  }));
}

export function toggleMiniMap() {
  useLocalStorage.setState((state) => ({ showMinimap: !state.showMinimap }));
}

export function toggleMiniMapSide() {
  useLocalStorage.setState((state) => ({
    minimapSide: state.minimapSide === "left" ? "right" : "left",
  }));
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

export function setChatSharedEdgeMode(mode: ChatSharedEdgeMode) {
  useLocalStorage.setState({ chatSharedEdgeMode: mode });
}

export function toggleChatSharedEdgeMode() {
  useLocalStorage.setState((state) => ({
    chatSharedEdgeMode:
      state.chatSharedEdgeMode === "agentic" ? "workflow" : "agentic",
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
  useLocalStorage.setState({
    overviewProjectConfigOrder: dedupeStringIds(orderedIds),
  });
}

export function resetOverviewPaneToDefaultLayout() {
  useLocalStorage.setState({
    overviewTab: OverviewTabNameEnum.Overview,
    uiEditorVis: false,
    uiEditorWidth: INITIAL_UI_EDITOR_WIDTH,
    uiEditorTrueWidth: CLOSED_PANE_WIDTH,
  });
  setPaneWidthWithLayout(PaneNameEnum.overview, INITIAL_OVERVIEW_WIDTH);
}
