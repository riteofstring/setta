import {
  GLOBAL_PARAM_SWEEP,
  GLOBAL_VARIABLES,
  OUTPUT,
  PARAM_SWEEP,
  requiresKeyInput,
  VAR_CONTROL,
} from "z_utils/constants";
import { useGetSectionTypeConfig, useIsOneOfType } from "./useSectionType";

export function useTitleIsEditable(sectionId: string) {
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");
  const isUneditableType = useIsOneOfType(sectionId, [
    OUTPUT,
    GLOBAL_VARIABLES,
    PARAM_SWEEP,
    GLOBAL_PARAM_SWEEP,
    VAR_CONTROL,
  ]);

  return requiresKeyInput(sectionSubType) && !isUneditableType;
}
