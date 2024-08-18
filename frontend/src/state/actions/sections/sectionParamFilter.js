import { useActiveSection, useSectionParamFilter } from "state/definitions";
import { maybePreventDefault } from "utils/utils";

export function setSectionParamFilter({ sectionId, filter }) {
  useSectionParamFilter.setState((state) => {
    state.x[sectionId] = filter;
  });
}

export function focusOnArgsFilter(e) {
  maybePreventDefault(e);
  const sectionIds = useActiveSection.getState().ids;
  if (sectionIds.length !== 1) {
    return;
  }
  const element = document.getElementById(`${sectionIds[0]}-args-filter`);
  if (element) {
    element.focus();
  }
}
