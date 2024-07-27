import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { useUITypes } from "state/definitions/uiTypes";
import { isRoot, isSeriesElement } from "utils/sectionTypeHelpers";
import { useGetSectionInfo } from "./useGetSectionInfo";

export function useGetSectionTypeConfig(sectionId, key) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => x.x[uiTypeId]["config"][key]);
}

export function useGetSectionType(sectionId, key) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const nonScalars = ["config"];
  const equalityFn = nonScalars.includes(key) ? _.isEqual : undefined;
  return useUITypes((x) => x.x[uiTypeId][key], equalityFn);
}

export function useIsSeriesElement(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => isSeriesElement(x.x[uiTypeId]["config"].subType));
}

export function useSectionTypeName(sectionId) {
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

export function useIsRoot(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => isRoot(x.x[uiTypeId].type));
}

export function useIsDeck(sectionId) {
  return useIsType(sectionId, C.DECK);
}

export function useIsOutput(sectionId) {
  return useIsType(sectionId, C.OUTPUT);
}

// export function useIsInfo(sectionId: string) {
//   return useIsType(sectionId, INFO);
// }

export function useIsSocial(sectionId) {
  return useIsType(sectionId, C.SOCIAL);
}

export function useIsGlobalVariables(sectionId) {
  return useIsType(sectionId, C.GLOBAL_VARIABLES);
}

// export function useIsCode(sectionId: string) {
//   return useIsType(sectionId, CODE);
// }

// export function useIsVarControl(sectionId: string) {
//   return useIsType(sectionId, VAR_CONTROL);
// }

export function useIsTerminal(sectionId) {
  return useIsType(sectionId, C.TERMINAL);
}
