import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";
import { useGetSectionInfo } from "./useSectionInfo";

export function useSectionSiblingNames(sectionId) {
  const [sectionName, parentId] = useGetSectionInfo(sectionId, [
    "name",
    "parentId",
  ]);
  const topLevelSectionIds = useStoreState((x) => x.projectConfig.children);
  const isTopLevel = topLevelSectionIds.includes(sectionId);
  const potentialSiblingIds = defaultState(
    useStoreState((x) => x.sectionInfos.currChildren[parentId]),
    () => []
  );
  const siblingIds = isTopLevel ? topLevelSectionIds : potentialSiblingIds;
  const siblingNames = useStoreState(
    (x) => siblingIds.map((y) => x.sectionInfos.idNames[y]),
    _.isEqual
  );
  const output = new Set(siblingNames);
  // delete self name
  output.delete(sectionName);
  return output;
}
