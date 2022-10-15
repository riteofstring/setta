import _ from "lodash";

import {
  AllObjCollectionInfo,
  AllPackageInfo,
  AllParamCollectionInfo,
} from "./immutableInfo";

export const createAllInfo = (available) => {
  const allPackageInfo = Object.freeze(new AllPackageInfo(available.packages));
  const allModuleInfo = createDirectMapping(allPackageInfo.children);
  const allObjInfo = createDirectMapping(allModuleInfo);
  const allObjCollections = Object.freeze(
    new AllObjCollectionInfo(available.objCollections, allObjInfo)
  );
  const allParamCollections = Object.freeze(
    new AllParamCollectionInfo(available.paramCollections)
  );
  return {
    allPackageInfo,
    allModuleInfo,
    allObjInfo,
    allObjCollections,
    allParamCollections,
  };
};

function createDirectMapping(sourceInfo) {
  const output = {};
  _.values(sourceInfo).forEach((x) =>
    _.values(x.children).forEach((y) => (output[y.id] = y))
  );
  return output;
}
