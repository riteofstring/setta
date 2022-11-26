import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";
import { useGetSectionInfo, useTopLevelSectionInfo } from "./useSectionInfo";

export function useSectionSiblingNames(sectionId) {
  const [sectionName, parentId, isTopLevel] = useGetSectionInfo(sectionId, [
    "name",
    "parentId",
    "isTopLevel",
  ]);
  const topLevelSections = useTopLevelSectionInfo();
  const siblingIds = defaultState(
    useStoreState((x) => x.sectionInfos.currChildren[parentId]),
    () => []
  );
  const siblingNames = useStoreState(
    (x) => siblingIds.map((y) => x.sectionInfos.idNames[y]),
    _.isEqual
  );
  let output;
  if (isTopLevel) {
    output = new Set(_.map(topLevelSections, (x) => x.name));
  } else {
    output = new Set(siblingNames);
  }
  // delete self name
  output.delete(sectionName);
  return output;
}
