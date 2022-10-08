import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";
import { useGetSectionInfo, useTopLevelSectionInfo } from "./useSectionInfo";

export function useSectionSiblingNames(sectionId) {
  const sectionInfo = useGetSectionInfo(sectionId);
  const topLevelSections = useTopLevelSectionInfo();
  const siblingIds = defaultState(
    useStoreState((x) => x.sectionInfos.currChildren[sectionInfo.parentId]),
    []
  );
  const siblingNames = useStoreState(
    (x) => siblingIds.map((y) => x.sectionInfos.idNames[y]),
    _.isEqual
  );
  let output;
  if (sectionInfo.isTopLevel) {
    output = new Set(_.map(topLevelSections, (x) => x.name));
  } else {
    output = new Set(siblingNames);
  }
  // delete self name
  output.delete(sectionInfo.name);
  return output;
}
