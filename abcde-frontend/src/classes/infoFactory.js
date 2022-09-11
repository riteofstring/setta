import { AllObjCollectionInfo, AllParamCollectionInfo } from "./immutableInfo";

export function createAllInfo(available) {
  const allObjInfo = Object.freeze(available.packages);
  const allObjCollections = Object.freeze(
    new AllObjCollectionInfo(available.objCollections, allObjInfo)
  );
  const allParamCollections = Object.freeze(
    new AllParamCollectionInfo(available.paramCollections)
  );
  return {
    allObjInfo,
    allObjCollections,
    allParamCollections,
  };
}
