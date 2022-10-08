import _ from "lodash";
import { CALLABLE, COLLECTION, PARAMETER } from "utils/constants";

export function createAllInfo(packages) {
  const allObjInfo = packages;
  const allCollections = _.pickBy(allObjInfo, (v) => v.rcType === COLLECTION);
  return { allObjInfo, allCollections };
}

function findAllDescendants(allCodeInfo, collectionId, rcType) {
  const output = [];
  const idStack = [collectionId];
  while (idStack.length > 0) {
    const currInfo = allCodeInfo[idStack.pop()];
    if (currInfo.rcType === rcType) {
      output.push(currInfo);
    }
    idStack.push(...currInfo.children);
  }
  return output;
}

export function findAllCallables(allCodeInfo, collectionId) {
  return findAllDescendants(allCodeInfo, collectionId, CALLABLE);
}

export function findAllParameters(allCodeInfo, collectionId) {
  return findAllDescendants(allCodeInfo, collectionId, PARAMETER);
}
