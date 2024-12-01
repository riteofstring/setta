import C from "constants/constants.json";
import { addCodeInfoBatch } from "state/actions/codeInfo";
import { useCodeInfo } from "state/definitions";
import { post } from "./utils";

async function dbGetCollectionsAndModules({ searchTerm }) {
  return await post({
    address: C.ROUTE_GET_COLLECTIONS_AND_MODULES,
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
    address: C.ROUTE_GET_COLLECTION_DETAILS,
    body: { codeInfoId: id },
  });

  addCodeInfoBatch(res.data);
}

export async function dbSaveCodeInfo({ codeInfo }) {
  return await post({
    address: C.ROUTE_SAVE_CODE_INFO,
    body: { codeInfo },
  });
}
