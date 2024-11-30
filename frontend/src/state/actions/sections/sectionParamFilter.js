import { useActiveSection, useSectionInfos } from "state/definitions";

export function setSectionParamFilter({ sectionId, filter }) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].paramFilter = filter;
  });
}

export function focusOnSearch() {
  const sectionIds = useActiveSection.getState().ids;
  let elementId;
  if (sectionIds.length === 1) {
    elementId = `${sectionIds[0]}-args-filter`;
  } else {
    elementId = "HeaderProjectSearch";
  }
  if (elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.focus({ preventScroll: true });
    }
  }
}
