import { useProjectConfig } from "models/info/projectConfig";
import { useGetManySectionInfos } from "./useSectionInfo";

export function useTopLevelSectionPositions() {
  const topLevelSectionIds = useProjectConfig((x) => x.children);
  return useGetManySectionInfos(topLevelSectionIds, ["initialPosition"], true);
}
