import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useGetManySectionInfos } from "./useSectionInfo";

export function useTopLevelSectionPositions() {
  const topLevelSectionIds = useProjectConfig((x) => x.children, _.isEqual);
  const ids = useGetManySectionInfos(topLevelSectionIds, "id");
  const initialPositions = useGetManySectionInfos(
    topLevelSectionIds,
    "initialPosition"
  );
  return [ids, initialPositions];
}

export function useIsTopLevelSection(sectionId: string) {
  return useProjectConfig((x) => x.children.includes(sectionId));
}
