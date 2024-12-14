import { useActiveSection, useProjectSearch } from "state/definitions";

export function focusOnSearch() {
  const sectionIds = useActiveSection.getState().ids;
  if (sectionIds.length === 1) {
    const element = document.getElementById(`${sectionIds[0]}-args-filter`);
    if (element) {
      element.focus({ preventScroll: true });
    }
    return;
  }

  useProjectSearch.setState({ mode: "simple" });
  clickOnProjectPageFind();
}

export function clickOnProjectPageFind() {
  const element = document.getElementById("ProjectPageFind");
  if (element) {
    element.focus();
  }
}

export function focusOnAdvancedSearch() {
  useProjectSearch.setState({ mode: "advanced" });
  clickOnProjectPageAdvancedSearch();
}

export function clickOnProjectPageAdvancedSearch() {
  const element = document.getElementById("ProjectPageFind");
  if (element) {
    element.click();
  }
}
