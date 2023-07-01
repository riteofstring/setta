import { requiresKeyInput } from "abcde-utils/src/constants";
import { useGetSectionInfo } from "./useSectionInfo";
import { useIsOutput } from "./useSectionType";

export function useTitleIsEditable(sectionId: string) {
  const paramInfoId = useGetSectionInfo(sectionId, "paramInfoId");
  const sectionSubType = useGetSectionInfo(sectionId, "uiSubType");
  const isOutput = useIsOutput(sectionId);

  return requiresKeyInput(sectionSubType) && !paramInfoId && !isOutput;
}
