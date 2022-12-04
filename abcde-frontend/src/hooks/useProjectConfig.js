import { useStoreState } from "easy-peasy";
import { useGetManySectionInfos } from "./useSectionInfo";

export function useTopLevelSectionInfos(props) {
  const topLevelSectionIds = useStoreState((x) => x.projectConfig.children);
  return useGetManySectionInfos(topLevelSectionIds, props);
}
