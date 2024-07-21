export const getDepthListing = (
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
