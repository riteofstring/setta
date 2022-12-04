import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { defaultState } from "utils/utils";
import { useGetSectionInfo, useSectionInfoNames } from "./useSectionInfo";

export function useSectionSiblingNames(sectionId) {
  const [sectionName, parentId] = useGetSectionInfo(sectionId, [
    "name",
    "parentId",
  ]);
  const topLevelSectionIds = useProjectConfig((x) => x.children);
  const isTopLevel = topLevelSectionIds.includes(sectionId);
  const potentialSiblingIds = defaultState(
    useSectionInfos((x) => x.currChildren[parentId]),
    () => []
  );
  const siblingIds = isTopLevel ? topLevelSectionIds : potentialSiblingIds;
  const siblingNames = useSectionInfoNames(
    (x) => siblingIds.map((y) => x[y]),
    _.isEqual
  );
  const output = new Set(siblingNames);
  // delete self name
  output.delete(sectionName);
  return output;
}
