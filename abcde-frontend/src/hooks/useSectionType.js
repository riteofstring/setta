import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";

import { useGetSectionInfo } from "./useSectionInfo";
import { getInfo } from "./utils";

export function useGetSectionTypeConfig(sectionId) {
  const sectionType = useGetSectionType(sectionId);
  if (_.isEmpty(sectionType)) {
    return {};
  }
  return sectionType.config;
}

export function useGetSectionType(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId).uiTypeId;
  return defaultState(
    useStoreState((x) => getInfo(x.uiTypes)[uiTypeId]),
    () => ({})
  );
}
