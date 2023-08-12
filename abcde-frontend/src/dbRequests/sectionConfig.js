import {
  GET_COLLECTIONS_AND_MODULES,
  GET_COLLECTION_DETAILS,
  SAVE_COLLECTIONS,
} from "abcde-utils/src/routes";
import { useCodeInfo } from "models/info/codeInfo";
import { NO_AUTH } from "utils/constants";
import {
  noAuthGetCollectionDetails,
  noAuthGetCollectionsAndModules,
} from "./noAuth/sectionConfig";
import { post } from "./utils";

async function dbGetCollectionsAndModules({ searchTerm }) {
  if (NO_AUTH) {
    return await noAuthGetCollectionsAndModules({ searchTerm });
  }

  return await post({
    address: GET_COLLECTIONS_AND_MODULES,
    body: { searchTerm },
  });
}

export function getCollectionsAndModulesFn(callback) {
  return async function onSearch(searchTerm) {
    const x = await dbGetCollectionsAndModules({ searchTerm });
    callback(x.data);
  };
}

export async function dbGetCollectionDetails(id) {
  const s = useCodeInfo.getState();
  if (id in s.allCodeInfo) {
    return;
  }

  let res;
  if (NO_AUTH) {
    res = await noAuthGetCollectionDetails(id);
  } else {
    res = await post({
      address: GET_COLLECTION_DETAILS,
      body: { codeInfoId: id },
    });
  }

  s.updateInfos(res.data);
}

export async function dbSaveCollections({ collections }) {
  if (NO_AUTH) {
    return;
  }

  return await post({
    address: SAVE_COLLECTIONS,
    body: { collections },
  });
}
