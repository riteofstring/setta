import {
  DECK,
  FN,
  INFO,
  isSeriesElement,
  isSeriesRoot,
  noParamsPossible,
  OUTPUT,
  SOCIAL,
  USER_SPECIFIED_OBJECT,
} from "abcde-utils/src/constants";
import {
  SectionUITypeConfigType,
  SectionUITypeType,
} from "abcde-utils/src/types/uiType";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetSectionTypeConfig<
  K extends keyof SectionUITypeConfigType
>(sectionId: string, key: K) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
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
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const nonScalars: (keyof SectionUITypeType)[] = ["config"];
  const equalityFn = nonScalars.includes(key) ? _.isEqual : undefined;
  return useUITypes((x) => x.x[uiTypeId][key], equalityFn);
}

export function useIsSeriesElement(sectionId: string) {
  return useSectionInfos((x) => isSeriesElement(x.x[sectionId].uiSubType));
}

function useIsType(sectionId: string, type) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => x.x[uiTypeId].type === type);
}

export function useUITypeIdAndSubType(sectionId: string) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const uiSubType = useGetSectionInfo(sectionId, "uiSubType");
  return { uiTypeId, uiSubType };
}

export function useIsSeriesRoot(sectionId: string) {
  const { uiTypeId, uiSubType } = useUITypeIdAndSubType(sectionId);
  return useUITypes((x) => isSeriesRoot(x.x[uiTypeId].type, uiSubType));
}

export function useNoParamsPossible(sectionId: string) {
  const { uiTypeId, uiSubType } = useUITypeIdAndSubType(sectionId);
  return useUITypes((x) => noParamsPossible(x.x[uiTypeId].type, uiSubType));
}

export function useIsDeck(sectionId: string) {
  return useIsType(sectionId, DECK);
}

export function useIsOutput(sectionId: string) {
  return useIsType(sectionId, OUTPUT);
}

export function useIsInfo(sectionId: string) {
  return useIsType(sectionId, INFO);
}

export function useIsSocial(sectionId: string) {
  return useIsType(sectionId, SOCIAL);
}

export function useIsFn(sectionId: string) {
  return useIsType(sectionId, FN);
}

export function useIsUserSpecifiedObject(sectionId: string) {
  return useIsType(sectionId, USER_SPECIFIED_OBJECT);
}
