import { ManyOf } from "./types/utils";

type DepthType = {
  id: string;
  name: string;
  depth: number;
};

export const getDepthListing = (
  topLevelIds: string[],
  children: { [id: string]: string[] },
  idNames: ManyOf<string>,
  sectionTypeNames: ManyOf<string>,
  sectionTypeFilter: any,
  startingDepth = 0,
) => {
  const outputList: DepthType[] = [];
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
  sectionId: string,
  children: { [id: string]: string[] },
  idNames: ManyOf<string>,
  sectionTypeNames: ManyOf<string>,
  sectionTypeFilter: any,
  depth: number,
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
