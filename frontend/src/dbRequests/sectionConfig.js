import { useCodeInfo } from "models/info/codeInfo";
import {
  GET_COLLECTIONS_AND_MODULES,
  GET_COLLECTION_DETAILS,
} from "z_utils/routes";
import { post } from "./utils";

async function dbGetCollectionsAndModules({ searchTerm }) {
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
  if (id in s.x) {
    return;
  }

  const res = await post({
    address: GET_COLLECTION_DETAILS,
    body: { codeInfoId: id },
  });

  s.update(res.data);
}

export async function dbSaveCodeInfo({ codeInfo }) {
  return await post({
    address: "/codeInfo/save",
    body: { codeInfo },
  });
}
