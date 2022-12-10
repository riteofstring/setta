export const getOverviewListing = (groups, currChildren, idNames) => {
  let outputList = [];
  for (let group of groups) {
    outputList.push([]);
    for (let sectionId of group) {
      outputList[outputList.length - 1].push(
        ...getOverviewListingHelper(sectionId, currChildren, idNames, 0)
      );
    }
  }
  return outputList;
};

const getOverviewListingHelper = (sectionId, currChildren, idNames, depth) => {
  let outputList = [];
  outputList.push({
    sectionId,
    sectionHeading: idNames[sectionId],
    depth: depth,
  });
  if (currChildren[sectionId]) {
    for (let childId of currChildren[sectionId]) {
      outputList.push(
        ...getOverviewListingHelper(childId, currChildren, idNames, depth + 1)
      );
    }
  }
  return outputList;
};
