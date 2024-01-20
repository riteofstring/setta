import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { getDepthListing } from "z_utils/childrenToDepth";
import { useMatchSorterFilter } from "./useMatchSorterFilter";
import { useSectionInfoNames } from "./useSectionInfo";

export function useGetOverviewListing() {
  const topLevelSectionIds = useProjectConfig(
    (x) => Object.keys(x.children),
    _.isEqual
  );
  const sectionChildren = useSectionInfos(
    (x) => _.mapValues(x.x, (v) => v.children),
    _.isEqual
  );
  const idNames = useSectionInfoNames();

  const sectionList = getDepthListing(
    topLevelSectionIds,
    sectionChildren,
    idNames
  );

  return useMatchSorterFilter(sectionList, ["name"]);
}
