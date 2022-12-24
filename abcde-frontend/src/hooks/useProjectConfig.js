import { useProjectConfig } from "models/info/projectConfig";
import { useGetManySectionInfos } from "./useSectionInfo";

export function useTopLevelSectionPositions() {
  const topLevelSectionIds = useProjectConfig((x) => x.children);
  const sectionInfos = useGetManySectionInfos(topLevelSectionIds, [
    "initialPosition",
  ]);
  return topLevelSectionIds.map((x, idx) => [x, sectionInfos[idx][0]]);
}
