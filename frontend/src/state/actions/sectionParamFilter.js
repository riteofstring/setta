import { useSectionParamFilter } from "state/definitions";

export function setSectionParamFilter({ sectionId, filter }) {
  useSectionParamFilter.setState((state) => {
    state.x[sectionId] = filter;
  });
}
