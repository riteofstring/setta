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
  clickOnProjectPageSearchBar();
}

export function focusOnAdvancedSearch() {
  useProjectSearch.setState({ mode: "advanced" });
  clickOnProjectPageSearchBar();
}

function clickOnProjectPageSearchBar() {
  const element = document.getElementById("ProjectPageSearchBar");
  console.log("clickOnProjectPageSearchBar", element)
  if (element) {
    element.click();
  }
}
