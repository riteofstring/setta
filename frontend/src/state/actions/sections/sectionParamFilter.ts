import { useProjectSearch, useProjectState } from "state/definitions";
import { ProjectSearchModeEnum } from "utils/constants";

export const ProjectPageSearchBarDivId = "ProjectPageSearchBar";

export function clickOnSearchBar() {
  // wait for re-render, otherwise the search bar re-renders after focusing on it
  requestAnimationFrame(() => {
    const element = document.getElementById(ProjectPageSearchBarDivId);
    if (element) {
      element.focus({ preventScroll: true });
    }
  });
}

export function focusOnSearch() {
  const sectionIds = useProjectState.getState().projectConfig.activeIds;
  if (sectionIds.length === 1) {
    const element = document.getElementById(`${sectionIds[0]}-args-filter`);
    if (element) {
      element.focus({ preventScroll: true });
    }
    return;
  }

  useProjectSearch.setState({ mode: ProjectSearchModeEnum.find });
  clickOnSearchBar();
}

export function focusOnAdvancedSearch() {
  useProjectSearch.setState({ mode: ProjectSearchModeEnum.advanced });
  clickOnSearchBar();
}

export function focusOnCommandPalette() {
  useProjectSearch.setState({ mode: ProjectSearchModeEnum.commandPalette });
  clickOnSearchBar();
}
