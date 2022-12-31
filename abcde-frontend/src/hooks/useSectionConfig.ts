import { SectionConfigType } from "abcde-utils/src/types/sectionConfig";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetSectionConfig<K extends keyof SectionConfigType>(
  sectionId: string,
  key: K
) {
  const configId = useGetSectionInfo(sectionId, "configId");
  return useSectionConfigs((x) => x.x[configId][key]);
}
