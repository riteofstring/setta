import C from "constants/constants.json";
import { requiresKeyInput } from "utils/sectionTypeHelpers";
import { useGetSectionTypeConfig, useIsOneOfType } from "./useSectionType";

export function useTitleIsEditable(sectionId) {
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");
  const isUneditableType = useIsOneOfType(sectionId, [
    C.OUTPUT,
    C.GLOBAL_VARIABLES,
    C.PARAM_SWEEP,
    C.GLOBAL_PARAM_SWEEP,
    C.VAR_CONTROL,
  ]);

  return requiresKeyInput(sectionSubType) && !isUneditableType;
}
