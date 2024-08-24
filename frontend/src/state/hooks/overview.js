import _ from "lodash";
import { useNodeInternals } from "state/definitions";
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

const getDepthListing = (
  topLevelIds,
  children,
  idNames,
  sectionTypeNames,
  sectionTypeFilter,
  startingDepth = 0,
) => {
  const outputList = [];
  for (const sectionId of topLevelIds) {
    outputList.push(
      ...getDepthListingHelper(
        sectionId,
        children,
        idNames,
        sectionTypeNames,
        sectionTypeFilter,
        startingDepth,
      ),
    );
  }
  return outputList;
};

const getDepthListingHelper = (
  sectionId,
  children,
  idNames,
  sectionTypeNames,
  sectionTypeFilter,
  depth,
) => {
  const outputList =
    !sectionTypeFilter || sectionTypeFilter(sectionTypeNames[sectionId])
      ? [
          {
            id: sectionId,
            name: idNames[sectionId],
            depth: depth,
          },
        ]
      : [];

  if (children[sectionId]) {
    for (const childId of children[sectionId]) {
      outputList.push(
        ...getDepthListingHelper(
          childId,
          children,
          idNames,
          sectionTypeNames,
          sectionTypeFilter,
          depth + 1,
        ),
      );
    }
  }
  return outputList;
};
