import {
  GET_COLLECTIONS_AND_MODULES,
  GET_COLLECTION_DETAILS,
} from "abcde-utils/src/routes";
import { useCodeInfo } from "models/info/codeInfo";
import { NO_AUTH } from "utils/constants";
import {
  noAuthGetCollectionDetails,
  noAuthGetCollectionsAndModules,
} from "./noAuth/sectionConfig";
import { post } from "./utils";

export async function getCollectionsAndModules({ searchTerm }) {
  if (NO_AUTH) {
    return await noAuthGetCollectionsAndModules({ searchTerm });
  }

  return post({
    address: GET_COLLECTIONS_AND_MODULES,
    body: { searchTerm },
    thenFn: (res) => res.data,
    catchFn: () => ({}),
  });
}

export async function getCollectionDetails(id) {
  const s = useCodeInfo.getState();
  if (id in s.allCollections) {
    return;
  }

  let results;
  if (NO_AUTH) {
    results = await noAuthGetCollectionDetails(id);
  } else {
    results = await post({
      address: GET_COLLECTION_DETAILS,
      body: { codeInfoId: id },
      thenFn: (res) => res.data,
      catchFn: () => ({}),
    });
  }

  s.updateInfos(results);
}
