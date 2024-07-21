import _ from "lodash";
import { useNodeInternals } from "state/definitions";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { getDepthListing } from "utils/childrenToDepth";
import { useSectionInfoNames } from "./useGetSectionInfo";
import { useMatchSorterFilter } from "./useMatchSorterFilter";
import { useSectionTypeNames } from "./useSectionType";

export function useGetOverviewListing(sectionTypeFilter = null) {
  const topLevelSectionIds = useNodeInternals(
    (x) => [...x.x.keys()],
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
