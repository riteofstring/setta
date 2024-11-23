import C from "constants/constants.json";
import _ from "lodash";
import {
  useNodeInternals,
  useSectionInfos,
  useSectionVariants,
} from "state/definitions";
import { getDepthListing } from "utils/childrenToDepth";
import { useSectionInfoNames } from "./sections";
import { useSectionIdToChildren } from "./sectionVariants";
import { useSectionTypeNames } from "./uiTypes";
import { useMatchSorterFilter } from "./utils";

export function useGetOverviewListing(sectionTypeFilter = null) {
  const topLevelSectionIds = useNodeInternals(
    (x) => [...x.x.keys()],
    _.isEqual,
  );
  const sectionChildren = useSectionIdToChildren();
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

const shownSectionTypes = [
  C.SECTION,
  C.LIST_ROOT,
  C.DICT_ROOT,
  C.DECK,
  C.GLOBAL_VARIABLES,
  C.CODE,
];

export function useRunGroupListing(variantId) {
  const sectionTypeNames = useSectionTypeNames();
  return useSectionVariants(
    (x) =>
      x.x[variantId].children.filter((c) =>
        shownSectionTypes.includes(sectionTypeNames[c]),
      ),
    _.isEqual,
  );
}

export function useTopLevelRunGroupListing() {
  const sectionTypeNames = useSectionTypeNames();
  return useSectionInfos((x) => {
    const output = [];
    for (const [k, v] of Object.entries(x.x)) {
      if (!v.parentId && shownSectionTypes.includes(sectionTypeNames[k])) {
        output.push({ id: k, name: v.name });
      }
    }
    return output;
  }, _.isEqual);
}
