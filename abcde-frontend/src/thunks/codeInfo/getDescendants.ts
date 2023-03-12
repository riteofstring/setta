import { CodeInfoType, RCType } from "abcde-utils/src/types/codeInfo";

function defaultCondition(currInfo: CodeInfoType, rcType: RCType) {
  return currInfo.rcType === rcType;
}

function findAllDescendants(
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
  return findAllDescendants(allCodeInfo, collectionIds, RCType.CALLABLE);
}

export function findAllParameters(allCodeInfo, collectionIds) {
  return findAllDescendants(allCodeInfo, collectionIds, RCType.PARAMETER);
}

export function findAllParameterCollections(allCodeInfo, collectionIds) {
  function condition(currInfo, rcType) {
    return (
      defaultCondition(currInfo, rcType) &&
      allCodeInfo[currInfo.inCodeParentId].rcType === RCType.COLLECTION
    );
  }

  return findAllDescendants(
    allCodeInfo,
    collectionIds,
    RCType.PARAMETER,
    condition
  );
}
