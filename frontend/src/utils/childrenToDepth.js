export const getDepthListing = (
  topLevelIds,
  children,
  idNames,
  startingDepth = 0,
) => {
  const outputList = [];
  for (const sectionId of topLevelIds) {
    outputList.push(
      ...getDepthListingHelper(sectionId, children, idNames, startingDepth),
    );
  }
  return outputList;
};

const getDepthListingHelper = (sectionId, children, idNames, depth) => {
  const outputList = [
    {
      id: sectionId,
      name: idNames[sectionId],
      depth: depth,
    },
  ];

  if (children[sectionId]) {
    for (const childId of children[sectionId]) {
      outputList.push(
        ...getDepthListingHelper(childId, children, idNames, depth + 1),
      );
    }
  }
  return outputList;
};
