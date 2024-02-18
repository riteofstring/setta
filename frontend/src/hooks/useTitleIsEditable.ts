import { requiresKeyInput } from "z_utils/constants";
import { useGetSectionTypeConfig, useIsGlobalVariables, useIsOutput } from "./useSectionType";

export function useTitleIsEditable(sectionId: string) {
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");
  const isOutput = useIsOutput(sectionId);
  const isGlobalVariables = useIsGlobalVariables(sectionId)

  return requiresKeyInput(sectionSubType) && !isOutput && !isGlobalVariables;
}
