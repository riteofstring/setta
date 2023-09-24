import { ManyOf } from "./types/utils";

type DepthType = {
  id: string;
  name: string;
  depth: number;
};

export const getDepthListing = (
  topLevelIds: string[],
  currChildren: { [id: string]: string[] },
  idNames: ManyOf<string>,
  startingDepth = 0
) => {
  const outputList: DepthType[] = [];
  for (const sectionId of topLevelIds) {
    outputList.push(
      ...getDepthListingHelper(sectionId, currChildren, idNames, startingDepth)
    );
  }
  return outputList;
};

const getDepthListingHelper = (
  sectionId: string,
  currChildren: { [id: string]: string[] },
  idNames: ManyOf<string>,
  depth: number
) => {
  const outputList = [
    {
      id: sectionId,
      name: idNames[sectionId],
      depth: depth,
    },
  ];
  if (currChildren[sectionId]) {
    for (const childId of currChildren[sectionId]) {
      outputList.push(
        ...getDepthListingHelper(childId, currChildren, idNames, depth + 1)
      );
    }
  }
  return outputList;
};
