import _ from "lodash";
import { useNodeInternals } from "state/definitions";
import { getDepthListing } from "utils/childrenToDepth";
import { useSectionInfoNames } from "./sections";
import { useSectionIdToChildren } from "./sectionVariants";
import { useMatchSorterFilter } from "./utils";

export function useGetOverviewListing() {
  const topLevelSectionIds = useNodeInternals(
    (x) => [...x.x.keys()],
    _.isEqual,
  );
  const sectionChildren = useSectionIdToChildren();
  const idNames = useSectionInfoNames();

  const sectionList = getDepthListing(
    topLevelSectionIds,
    sectionChildren,
    idNames,
  );

  return useMatchSorterFilter(sectionList, ["name"]);
}
