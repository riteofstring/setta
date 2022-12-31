import { SectionUITypeConfigType } from "abcde-utils/src/types/uiType";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { useGetSectionConfig } from "./useSectionConfig";

export function useGetSectionTypeConfig<
  K extends keyof SectionUITypeConfigType
>(sectionId: string, key: K) {
  const uiTypeId = useGetSectionConfig(sectionId, "uiTypeId");
  const equalityFn = key === "collections" ? _.isEqual : undefined;
  return useUITypes(
    (x) => (x.x[uiTypeId]["config"] as SectionUITypeConfigType)[key],
    equalityFn
  );
}

export function useGetSectionType(sectionId, props) {
  const uiTypeId = useGetSectionConfig(sectionId, "uiTypeId");
  return useUITypes((x) => props.map((y) => x.x[uiTypeId]?.[y]), _.isEqual);
}
