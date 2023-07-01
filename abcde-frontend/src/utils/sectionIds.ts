import { ManySectionChildrenType } from "abcde-utils/src/types/sectionChildren";
import { ManyOf } from "abcde-utils/src/types/utils";

type OverviewType = {
  sectionId: string;
  sectionHeading: string;
  depth: number;
};

type IdNamesType = ManyOf<string>;

export const getOverviewListing = (
  topLevelIds: string[],
  currChildren: ManySectionChildrenType,
  idNames: IdNamesType
) => {
  const outputList: OverviewType[] = [];
  for (const sectionId of topLevelIds) {
    outputList.push(
      ...getOverviewListingHelper(sectionId, currChildren, idNames, 0)
    );
  }
  return outputList;
};

const getOverviewListingHelper = (
  sectionId: string,
  currChildren: ManySectionChildrenType,
  idNames: IdNamesType,
  depth: number
) => {
  const outputList = [
    {
      sectionId,
      sectionHeading: idNames[sectionId],
      depth: depth,
    },
  ];
  if (currChildren[sectionId]) {
    for (const childId of currChildren[sectionId]) {
      outputList.push(
        ...getOverviewListingHelper(childId, currChildren, idNames, depth + 1)
      );
    }
  }
  return outputList;
};
