export const getOverviewListing = (groups, idsOverview, idNames) => {
  let outputList = [];
  for (let group of groups) {
    outputList.push([]);
    for (let sectionId of group) {
      outputList[outputList.length - 1].push(
        ...getOverviewListingHelper(sectionId, idsOverview, idNames, 0)
      );
    }
  }
  return outputList;
};

const getOverviewListingHelper = (sectionId, idsOverview, idNames, depth) => {
  let outputList = [];
  outputList.push({
    sectionId,
    sectionHeading: idNames[sectionId],
    depth: depth,
  });
  if (idsOverview[sectionId]) {
    for (let childId of idsOverview[sectionId]) {
      outputList.push(
        ...getOverviewListingHelper(childId, idsOverview, idNames, depth + 1)
      );
    }
  }
  return outputList;
};
