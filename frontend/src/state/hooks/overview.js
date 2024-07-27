import _ from "lodash";
import { useNodeInternals, useSectionInfos } from "state/definitions";
import { getDepthListing } from "utils/childrenToDepth";
import { useSectionInfoNames } from "./sections";
import { useSectionTypeNames } from "./uiTypes";
import { useMatchSorterFilter } from "./utils";

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
