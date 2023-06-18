import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { getOverviewListing } from "utils/sectionIds";
import { useMatchSorterFilter } from "./useMatchSorterFilter";
import { useSectionInfoNames } from "./useSectionInfo";

export function useGetOverviewListing() {
  const topLevelSectionIds = useProjectConfig((x) => x.children, _.isEqual);
  const currChildren = useSectionInfos(
    (x) => _.mapValues(x.x, (v) => v.currChildren),
    _.isEqual
  );
  const idNames = useSectionInfoNames();

  const sectionList = getOverviewListing(
    topLevelSectionIds,
    currChildren,
    idNames
  );

  return useMatchSorterFilter(sectionList, ["sectionHeading"]);
}
