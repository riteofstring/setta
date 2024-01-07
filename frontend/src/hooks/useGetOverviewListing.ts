import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useStore as useRfStore } from "reactflow";
import { areMapKeysEqual } from "utils/utils";
import { getDepthListing } from "z_utils/childrenToDepth";
import { useMatchSorterFilter } from "./useMatchSorterFilter";
import { useSectionInfoNames } from "./useSectionInfo";

export function useGetOverviewListing() {
  const topLevelSectionIds = useRfStore(
    (x) => x.nodeInternals,
    areMapKeysEqual
  ).keys();
  const currChildren = useSectionInfos(
    (x) => _.mapValues(x.x, (v) => v.currChildren),
    _.isEqual
  );
  const idNames = useSectionInfoNames();

  const sectionList = getDepthListing(
    topLevelSectionIds,
    currChildren,
    idNames
  );

  return useMatchSorterFilter(sectionList, ["name"]);
}
