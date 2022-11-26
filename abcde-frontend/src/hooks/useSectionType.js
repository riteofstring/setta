import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { useGetSectionConfig } from "./useSectionConfig";

export function useGetSectionTypeConfig(sectionId) {
  const [config] = useGetSectionType(sectionId, ["config"]);
  return config ? config : {};
}

export function useGetSectionType(sectionId, props) {
  const [uiTypeId] = useGetSectionConfig(sectionId, ["uiTypeId"]);
  return useStoreState(
    (x) => props.map((y) => x.uiTypes.x[uiTypeId]?.[y]),
    _.isEqual
  );
}
