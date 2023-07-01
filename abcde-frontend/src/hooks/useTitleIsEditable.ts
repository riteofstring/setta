import { useGetSectionInfo } from "./useSectionInfo";
import { useIsOutput } from "./useSectionType";

export function useTitleIsEditable(sectionId: string) {
  const paramInfoId = useGetSectionInfo(sectionId, "paramInfoId");
  const isOutput = useIsOutput(sectionId);

  return !paramInfoId && !isOutput;
}
