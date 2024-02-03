import { requiresKeyInput } from "z_utils/constants";
import { useGetSectionTypeConfig, useIsOutput } from "./useSectionType";

export function useTitleIsEditable(sectionId: string) {
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");
  const isOutput = useIsOutput(sectionId);

  return requiresKeyInput(sectionSubType) && !isOutput;
}
