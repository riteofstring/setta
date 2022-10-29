import { getCollections } from "classes/infoFactory";
import _ from "lodash";
import { NO_AUTH } from "utils/constants";
import { loadSpecificTestData } from "__tests__utils/loadTestData";

export async function getCollectionsAndModules({ searchTerm }) {
  if (NO_AUTH) {
    const results = await loadSpecificTestData({ name: "AllCodeInfo" });
    const collections = getCollections(results);
    return _.pickBy(collections, (x) => x.name.includes(searchTerm));
  }

  //TODO
}
