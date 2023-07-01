import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useGetSectionInfo, useSomeSectionInfoNames } from "./useSectionInfo";

export function useSectionSiblingNames(sectionId: string) {
  const sectionName = useGetSectionInfo(sectionId, "name");
  const parentId = useGetSectionInfo(sectionId, "parentId");
  const topLevelSectionIds = useProjectConfig(
    (x) => Object.keys(x.children),
    _.isEqual
  );
  const isTopLevel = topLevelSectionIds.includes(sectionId);
  const potentialSiblingIds = useSectionInfos(
    (x) => (parentId ? _.defaultTo(x.x[parentId].currChildren, []) : []),
    _.isEqual
  );
  const siblingIds = isTopLevel ? topLevelSectionIds : potentialSiblingIds;
  const siblingNames = useSomeSectionInfoNames(siblingIds);
  const output = new Set(siblingNames);
  // delete self name
  output.delete(sectionName);
  return output;
}
