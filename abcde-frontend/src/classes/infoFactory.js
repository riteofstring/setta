import _ from "lodash";
import { CALLABLE, COLLECTION, PARAMETER } from "utils/constants";

export function createAllInfo(packages) {
  const allObjInfo = packages;
  const allCollections = _.pickBy(allObjInfo, (v) => v.rcType === COLLECTION);
  return { allObjInfo, allCollections };
}

function defaultCondition(currInfo, rcType) {
  return currInfo.rcType === rcType;
}

function findAllDescendants(
  allCodeInfo,
  collectionIds,
  rcType,
  condition = defaultCondition
) {
  const output = [];
  const idStack = [...collectionIds];
  const visited = new Set();
  while (idStack.length > 0) {
    const id = idStack.pop();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const currInfo = allCodeInfo[id];
    if (condition(currInfo, rcType)) {
      output.push(currInfo);
    }
    idStack.push(...currInfo.children);
  }
  return output;
}

export function findAllCallables(allCodeInfo, collectionIds) {
  return findAllDescendants(allCodeInfo, collectionIds, CALLABLE);
}

export function findAllParameters(allCodeInfo, collectionIds) {
  return findAllDescendants(allCodeInfo, collectionIds, PARAMETER);
}

export function findAllParameterCollections(allCodeInfo, collectionIds) {
  function condition(currInfo, rcType) {
    return (
      defaultCondition(currInfo, rcType) &&
      allCodeInfo[currInfo.parentId].rcType === COLLECTION
    );
  }

  return findAllDescendants(allCodeInfo, collectionIds, PARAMETER, condition);
}
