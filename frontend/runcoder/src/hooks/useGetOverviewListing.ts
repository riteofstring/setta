import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { getDepthListing } from "z_utils/childrenToDepth";
import { useMatchSorterFilter } from "./useMatchSorterFilter";
import { useSectionInfoNames } from "./useSectionInfo";
import { useSectionTypeNames } from "./useSectionType";

export function useGetOverviewListing(sectionTypeFilter=null) {
  const topLevelSectionIds = useProjectConfig(
    (x) => Object.keys(x.children),
    _.isEqual
  );
  const sectionChildren = useSectionInfos(
    (x) => _.mapValues(x.x, (v) => v.children),
    _.isEqual
  );
  const idNames = useSectionInfoNames();
  const sectionTypeNames = useSectionTypeNames();

  const sectionList = getDepthListing(
    topLevelSectionIds,
    sectionChildren,
    idNames,
    sectionTypeNames,
    sectionTypeFilter
  );

  return useMatchSorterFilter(sectionList, ["name"]);
}
