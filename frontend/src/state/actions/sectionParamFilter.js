import { useSectionParamFilter } from "state/definitions/sectionParamFilter";

export function setSectionParamFilter({ sectionId, filter }) {
  useSectionParamFilter.setState((state) => {
    state.x[sectionId] = filter;
  });
}
