import { CodeInfoType, RCType } from "./types/codeInfo";

function defaultCondition(currInfo: CodeInfoType, rcType: RCType) {
  return currInfo.rcType === rcType;
}

function _findAllDescendants(
  allCodeInfo,
  collectionIds,
  rcType,
  condition = defaultCondition
) {
  const output: CodeInfoType[] = [];
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

function findAllCallables(allCodeInfo, collectionIds, parentCondition) {
  function condition(currInfo, rcType) {
    return (
      defaultCondition(currInfo, rcType) &&
      parentCondition(allCodeInfo[currInfo.inCodeParentId]?.rcType)
    );
  }

  return _findAllDescendants(
    allCodeInfo,
    collectionIds,
    RCType.CALLABLE,
    condition
  );
}

export function findAllCallablesOfCollections(allCodeInfo, collectionIds) {
  function condition(parentRcType) {
    // check inequality instead of equality with RCType.COLLECTION
    // because parentRcType might be undefined
    return (
      parentRcType !== RCType.CALLABLE && parentRcType !== RCType.PARAMETER
    );
  }
  return findAllCallables(allCodeInfo, collectionIds, condition);
}

export function findAllCallablesOfCallables(allCodeInfo, collectionIds) {
  function condition(parentRcType) {
    return parentRcType === RCType.CALLABLE;
  }
  return findAllCallables(allCodeInfo, collectionIds, condition);
}

export function findAllParameters(allCodeInfo, collectionIds) {
  return _findAllDescendants(allCodeInfo, collectionIds, RCType.PARAMETER);
}

export function findAllParameterCollections(allCodeInfo, collectionIds) {
  function condition(currInfo, rcType) {
    return (
      defaultCondition(currInfo, rcType) &&
      allCodeInfo[currInfo.inCodeParentId].rcType === RCType.COLLECTION
    );
  }

  return _findAllDescendants(
    allCodeInfo,
    collectionIds,
    RCType.PARAMETER,
    condition
  );
}

export function findAllDescendants(allCodeInfo, collectionIds) {
  const condition = () => true;
  return _findAllDescendants(allCodeInfo, collectionIds, null, condition);
}
