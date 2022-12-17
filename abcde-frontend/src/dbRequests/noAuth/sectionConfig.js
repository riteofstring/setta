export async function noAuthGetCollectionsAndModules({
  allCollections,
  searchTerm,
  searchCollectionsInMemory,
}) {
  return searchCollectionsInMemory({ allCollections, searchTerm });
}

export async function noAuthGetCollectionDetails() {
  return {};
}
