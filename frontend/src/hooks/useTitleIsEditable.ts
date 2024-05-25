import C from "constants/constants.json";
import { requiresKeyInput } from "z_utils/constants";
import { useGetSectionTypeConfig, useIsOneOfType } from "./useSectionType";

export function useTitleIsEditable(sectionId: string) {
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
