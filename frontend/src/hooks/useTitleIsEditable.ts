import {
  GLOBAL_VARIABLES,
  OUTPUT,
  PARAM_SWEEP,
  requiresKeyInput,
} from "z_utils/constants";
import { useGetSectionTypeConfig, useIsOneOfType } from "./useSectionType";

export function useTitleIsEditable(sectionId: string) {
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");
  const isUneditableType = useIsOneOfType(sectionId, [
    OUTPUT,
    GLOBAL_VARIABLES,
    PARAM_SWEEP,
  ]);

  return requiresKeyInput(sectionSubType) && !isUneditableType;
}
