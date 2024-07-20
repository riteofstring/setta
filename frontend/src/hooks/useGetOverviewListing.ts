import _ from "lodash";
import { useNodeInternals } from "models/info/nodeInternals";
import { useSectionInfos } from "state/sectionInfos/definition";
import { getDepthListing } from "z_utils/childrenToDepth";
import { useSectionInfoNames } from "../state/sectionInfos/hooks";
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
