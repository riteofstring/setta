import { useActiveSection, useProjectSearch } from "state/definitions";

export function focusOnSearch() {
  const sectionIds = useActiveSection.getState().ids;
  let elementId;
  if (sectionIds.length === 1) {
    elementId = `${sectionIds[0]}-args-filter`;
  } else {
    elementId = "ProjectPageFind";
  }
  if (elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.focus({ preventScroll: true });
    }
  }
}

export function focusOnAdvancedSearch() {
  useProjectSearch.setState({ mode: "advanced" });
  const element = document.getElementById("ProjectPageAdvancedSearch");
  if (element) {
    console.log("focusing", element)
    element.focus({ preventScroll: true });
  }
}
