import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";

function searchCollectionsInMemory({ searchTerm }) {
  const allCollections = useCodeInfo.getState().allCollections;
  if (!searchTerm) {
    return allCollections;
  }
  return _.pickBy(allCollections, (x) => x.name.includes(searchTerm));
}

export async function noAuthGetCollectionsAndModules({ searchTerm }) {
  const results = searchCollectionsInMemory({ searchTerm });
  const allCodeInfo = useCodeInfo.getState().allCodeInfo;
  return assembleCollectionsForSectionConfig(allCodeInfo, results);
}

export async function noAuthGetCollectionDetails() {
  return {};
}
