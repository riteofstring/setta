import { RCType } from 'abcde-utils/src/types/codeInfo';
import * as _ from 'lodash';

function getDescendantsOfAllCollections(allCodeInfo, allCollections, fn) {
  const output = {};
  for (const k of Object.keys(allCollections)) {
    output[k] = fn(allCodeInfo, [k]);
  }
  return output;
}

function getCallables(allCodeInfo, allCollections) {
  return getDescendantsOfAllCollections(
    allCodeInfo,
    allCollections,
    findAllCallables,
  );
}

function getParams(allCodeInfo) {
  return getDescendantsOfAllCollections(
    allCodeInfo,
    allCodeInfo,
    findAllParameters,
  );
}

function getParamCollections(allCodeInfo, allCollections) {
  return getDescendantsOfAllCollections(
    allCodeInfo,
    allCollections,
    findAllParameterCollections,
  );
}

export function getCollections(allCodeInfo) {
  return _.pickBy(allCodeInfo, (v) => v.rcType === RCType.COLLECTION);
}

export function createAllInfo(packages) {
  const allCodeInfo = packages;
  const allCollections = getCollections(allCodeInfo);
  const callables = getCallables(allCodeInfo, allCollections);
  const params = getParams(allCodeInfo);
  const paramCollections = getParamCollections(allCodeInfo, allCollections);
  return { allCodeInfo, allCollections, callables, params, paramCollections };
}

function defaultCondition(currInfo, rcType) {
  return currInfo.rcType === rcType;
}

export function findAllDescendants(
  allCodeInfo,
  collectionIds,
  rcType,
  condition = defaultCondition,
) {
  const output = [] as any;
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
  return output.reverse();
}

export function findAllCallables(allCodeInfo, collectionIds) {
  return findAllDescendants(allCodeInfo, collectionIds, RCType.CALLABLE);
}

export function findAllParameters(allCodeInfo, collectionIds) {
  return findAllDescendants(allCodeInfo, collectionIds, RCType.PARAMETER);
}

function findAllParameterCollections(allCodeInfo, collectionIds) {
  function condition(currInfo, rcType) {
    return (
      defaultCondition(currInfo, rcType) &&
      allCodeInfo[currInfo.parentId].rcType === RCType.COLLECTION
    );
  }

  return findAllDescendants(
    allCodeInfo,
    collectionIds,
    RCType.PARAMETER,
    condition,
  );
}
