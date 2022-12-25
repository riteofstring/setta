import { useProjectConfig } from "models/info/projectConfig";
import { useGetManySectionInfos } from "./useSectionInfo";

export function useTopLevelSectionInfos(props) {
  const topLevelSectionIds = useProjectConfig((x) => x.children);
  return useGetManySectionInfos(topLevelSectionIds, props);
}
