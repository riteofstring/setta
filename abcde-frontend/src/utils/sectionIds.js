export const getOverviewListing = (topLevelIds, currChildren, idNames) => {
  const outputList = [];
  for (const sectionId of topLevelIds) {
    outputList.push(
      ...getOverviewListingHelper(sectionId, currChildren, idNames, 0)
    );
  }
  return outputList;
};

const getOverviewListingHelper = (sectionId, currChildren, idNames, depth) => {
  const outputList = [];
  outputList.push({
    sectionId,
    sectionHeading: idNames[sectionId],
    depth: depth,
  });
  if (currChildren[sectionId]) {
    for (const childId of currChildren[sectionId]) {
      outputList.push(
        ...getOverviewListingHelper(childId, currChildren, idNames, depth + 1)
      );
    }
  }
  return outputList;
};
