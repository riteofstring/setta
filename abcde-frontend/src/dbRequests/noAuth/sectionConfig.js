import { findAllDescendants, getCollections } from "classes/infoFactory";
import _ from "lodash";
import { loadSpecificTestData } from "__tests__utils/loadTestData";

export async function noAuthGetCollectionsAndModules({
  allCollections,
  searchTerm,
  searchCollectionsInMemory,
}) {
  const testData = await loadSpecificTestData({ name: "AllCodeInfo" });
  const collections = getCollections(testData);
  const searchResults = _.pickBy(collections, (x) =>
    x.name.includes(searchTerm)
  );
  return {
    ...searchResults,
    ...searchCollectionsInMemory({ allCollections, searchTerm }),
  };
}

export async function noAuthGetCollectionDetails(id) {
  const allCodeInfo = await loadSpecificTestData({ name: "AllCodeInfo" });
  const collection = allCodeInfo[id];
  let allDescendants = findAllDescendants(allCodeInfo, [id], null, () => true);
  allDescendants = _.keyBy(allDescendants, "id");
  return { ...allDescendants, [id]: collection };
}
