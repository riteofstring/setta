import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { getAllCollections } from "thunks/codeInfo/codeInfo";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";

function searchCollectionsInMemory({ searchTerm }) {
  const allCollections = getAllCollections();
  if (!searchTerm) {
    return allCollections;
  }
  return _.pickBy(allCollections, (x) => x.name.includes(searchTerm));
}

export async function noAuthGetCollectionsAndModules({ searchTerm }) {
  const results = searchCollectionsInMemory({ searchTerm });
  const allCodeInfo = useCodeInfo.getState().allCodeInfo;
  return { data: assembleCollectionsForSectionConfig(allCodeInfo, results) };
}

export async function noAuthGetCollectionDetails() {
  return { data: {} };
}
