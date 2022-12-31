import { requiresKeyInput } from "utils/constants";
import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useTitleIsEditable(sectionId) {
  const paramInfoId = useGetSectionInfo(sectionId, "paramInfoId");
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");

  return requiresKeyInput(sectionSubType) && !paramInfoId;
}
