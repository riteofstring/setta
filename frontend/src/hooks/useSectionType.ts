import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import {
  DECK,
  GLOBAL_VARIABLES,
  isRoot,
  isSeriesElement,
  OUTPUT,
  SOCIAL,
  TERMINAL,
} from "z_utils/constants";
import {
  SectionUITypeConfigType,
  SectionUITypeType,
} from "z_utils/types/uiType";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetSectionTypeConfig<
  K extends keyof SectionUITypeConfigType,
>(sectionId: string, key: K) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes(
    (x) => (x.x[uiTypeId]["config"] as SectionUITypeConfigType)[key],
  );
}

export function useGetSectionType<K extends keyof SectionUITypeType>(
  sectionId: string,
  key: K,
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
      (x.x[uiTypeId]["config"] as SectionUITypeConfigType).subType,
    ),
  );
}

export function useSectionTypeName(sectionId: string) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => x.x[uiTypeId].type);
}

export function useSectionTypeNames() {
  const sectionIdToUITypeId = useSectionInfos(
    (x) => _.mapValues(x.x, (s) => s.uiTypeId),
    _.isEqual,
  );
  return useUITypes((x) =>
    _.mapValues(sectionIdToUITypeId, (s) => x.x[s].type),
  );
}

function useIsType(sectionId, type) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => x.x[uiTypeId].type === type);
}

export function useIsOneOfType(sectionId, types) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => types.includes(x.x[uiTypeId].type));
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

// export function useIsInfo(sectionId: string) {
//   return useIsType(sectionId, INFO);
// }

export function useIsSocial(sectionId: string) {
  return useIsType(sectionId, SOCIAL);
}

export function useIsGlobalVariables(sectionId: string) {
  return useIsType(sectionId, GLOBAL_VARIABLES);
}

// export function useIsScript(sectionId: string) {
//   return useIsType(sectionId, SCRIPT);
// }

// export function useIsCode(sectionId: string) {
//   return useIsType(sectionId, CODE);
// }

// export function useIsVarControl(sectionId: string) {
//   return useIsType(sectionId, VAR_CONTROL);
// }

export function useIsTerminal(sectionId: string) {
  return useIsType(sectionId, TERMINAL);
}
