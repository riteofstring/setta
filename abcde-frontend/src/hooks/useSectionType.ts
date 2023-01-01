import {
  SectionUITypeConfigType,
  SectionUITypeType,
} from "abcde-utils/src/types/uiType";
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

export function useGetSectionType<K extends keyof SectionUITypeType>(
  sectionId: string,
  key: K
) {
  const uiTypeId = useGetSectionConfig(sectionId, "uiTypeId");
  const nonScalars: (keyof SectionUITypeType)[] = ["config", "originInfoId"];
  const equalityFn = nonScalars.includes(key) ? _.isEqual : undefined;
  return useUITypes((x) => x.x[uiTypeId][key], equalityFn);
}
