import {
  useActiveSection,
  useProjectSearch,
  useSectionRefs,
} from "state/definitions";

export function focusOnSearch() {
  const sectionIds = useActiveSection.getState().ids;
  if (sectionIds.length === 1) {
    const element = document.getElementById(`${sectionIds[0]}-args-filter`);
    if (element) {
      element.focus({ preventScroll: true });
    }
    return;
  }

  useProjectSearch.setState({ mode: "find" });
  const element = document.getElementById("ProjectPageSearchBar");
  if (element) {
    element.focus({ preventScroll: true });
  }
}

export function focusOnAdvancedSearch() {
  useProjectSearch.setState({ mode: "advanced" });
  const unsub = useSectionRefs.subscribe(
    (state) => state.other["ProjectPageSearchBar"],
    (x) => {
      if (x) {
        x.click();
      }
      unsub();
    },
  );
}
