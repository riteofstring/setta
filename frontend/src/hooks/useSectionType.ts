import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import {
  CODE,
  DECK,
  GLOBAL_VARIABLES,
  INFO,
  isRoot,
  isSeriesElement,
  OUTPUT,
  SCRIPT,
  SOCIAL,
  VAR_CONTROL,
} from "z_utils/constants";
import {
  SectionUITypeConfigType,
  SectionUITypeType,
} from "z_utils/types/uiType";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetSectionTypeConfig<
  K extends keyof SectionUITypeConfigType
>(sectionId: string, key: K) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes(
    (x) => (x.x[uiTypeId]["config"] as SectionUITypeConfigType)[key]
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
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) =>
    isSeriesElement(
      (x.x[uiTypeId]["config"] as SectionUITypeConfigType).subType
    )
  );
}

function useIsType(sectionId: string, type) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => x.x[uiTypeId].type === type);
}

export function useIsRoot(sectionId: string) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => isRoot(x.x[uiTypeId].type));
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

export function useIsGlobalVariables(sectionId: string) {
  return useIsType(sectionId, GLOBAL_VARIABLES);
}

export function useIsScript(sectionId: string) {
  return useIsType(sectionId, SCRIPT);
}

export function useIsCode(sectionId: string) {
  return useIsType(sectionId, CODE);
}

export function useIsVarControl(sectionId: string) {
  return useIsType(sectionId, VAR_CONTROL);
}
