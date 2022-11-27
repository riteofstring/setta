import { requiresKeyInput } from "utils/constants";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useTitleIsEditable(sectionId) {
  const [sectionSubType] = useGetSectionTypeConfig(sectionId, ["subType"]);

  if (requiresKeyInput(sectionSubType)) {
    return true;
  }
  return false;
}
