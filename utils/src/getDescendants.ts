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

export function findAllCallables(allCodeInfo, collectionIds) {
  return _findAllDescendants(allCodeInfo, collectionIds, RCType.CALLABLE);
}

export function findAllParameters(allCodeInfo, collectionIds) {
  return _findAllDescendants(allCodeInfo, collectionIds, RCType.PARAMETER);
}

export function findAllParameterCollections(allCodeInfo, collectionIds) {
  return _findAllDescendants(
    allCodeInfo,
    collectionIds,
    RCType.PARAMETER_COLLECTION
  );
}

export function findAllDescendants(allCodeInfo, collectionIds) {
  const condition = () => true;
  return _findAllDescendants(allCodeInfo, collectionIds, null, condition);
}
