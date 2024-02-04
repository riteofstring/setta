import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useStore } from "xyflow/core";
import { getDepthListing } from "z_utils/childrenToDepth";
import { useMatchSorterFilter } from "./useMatchSorterFilter";
import { useSectionInfoNames } from "./useSectionInfo";
import { useSectionTypeNames } from "./useSectionType";

export function useGetOverviewListing(sectionTypeFilter = null) {
  const topLevelSectionIds = useStore(
    (x) => [...x.nodeInternals.keys()],
    _.isEqual,
  );
  const sectionChildren = useSectionInfos(
    (x) => _.mapValues(x.x, (v) => v.children),
    _.isEqual,
  );
  const idNames = useSectionInfoNames();
  const sectionTypeNames = useSectionTypeNames();

  const sectionList = getDepthListing(
    topLevelSectionIds,
    sectionChildren,
    idNames,
    sectionTypeNames,
    sectionTypeFilter,
  );

  return useMatchSorterFilter(sectionList, ["name"]);
}
