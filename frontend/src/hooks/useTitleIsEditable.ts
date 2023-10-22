import { requiresKeyInput } from "z_utils/constants";
import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionTypeConfig, useIsOutput } from "./useSectionType";

export function useTitleIsEditable(sectionId: string) {
  const paramInfoId = useGetSectionInfo(sectionId, "paramInfoId");
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");
  const isOutput = useIsOutput(sectionId);

  return requiresKeyInput(sectionSubType) && !paramInfoId && !isOutput;
}
