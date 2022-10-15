import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";

export function useGetSectionTypeConfig(sectionId) {
  const sectionType = useGetSectionType(sectionId);
  if (_.isEmpty(sectionType)) {
    return {};
  }
  return sectionType.config;
}

export function useGetSectionType(sectionId) {
  const uiTypeId = useGetSectionConfig(sectionId).uiTypeId;
  return defaultState(
    useStoreState((x) => x.uiTypes.x[uiTypeId]),
    () => ({})
  );
}
