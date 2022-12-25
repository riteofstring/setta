import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { useGetSectionConfig } from "./useSectionConfig";

export function useGetSectionTypeConfig(sectionId, props) {
  const [uiTypeId] = useGetSectionConfig(sectionId, ["uiTypeId"]);
  return useUITypes(
    (x) => props.map((y) => x.x[uiTypeId]?.["config"]?.[y]),
    _.isEqual
  );
}

export function useGetSectionType(sectionId, props) {
  const [uiTypeId] = useGetSectionConfig(sectionId, ["uiTypeId"]);
  return useUITypes((x) => props.map((y) => x.x[uiTypeId]?.[y]), _.isEqual);
}
