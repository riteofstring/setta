import _ from "lodash";
import { useNodeInternals } from "state/definitions";
import { getDepthListing } from "utils/childrenToDepth";
import { useSectionInfoNames } from "./sections";
import { useSectionIdToChildren } from "./sectionVariants";

export function useGetOverviewListing() {
  const topLevelSectionIds = useNodeInternals(
    (x) => [...x.x.keys()],
    _.isEqual,
  );
  const sectionChildren = useSectionIdToChildren();
  const idNames = useSectionInfoNames();

  return getDepthListing(topLevelSectionIds, sectionChildren, idNames);
}
