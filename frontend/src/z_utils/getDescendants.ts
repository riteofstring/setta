import C from "constants/constants.json";
import { CodeInfoType } from "./types/codeInfo";

function _findAllDescendants(
  allCodeInfo,
  codeInfoIds,
  outputCondition,
  stackCondition,
) {
  const output: CodeInfoType[] = [];
  const idStack = codeInfoIds.filter((x) => stackCondition(allCodeInfo[x]));
  const visited = new Set();
  while (idStack.length > 0) {
    const id = idStack.pop();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const currInfo = allCodeInfo[id];
    if (outputCondition(currInfo)) {
      output.push(currInfo);
    }
    if (stackCondition(currInfo)) {
      idStack.push(...currInfo.children);
    }
  }
  return output.reverse();
}

export function findAllCallables(allCodeInfo, codeInfoIds) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    (c) => c?.rcType === C.CALLABLE,
    () => true,
  );
}

export function findAllParametersOfCallables(allCodeInfo, codeInfoIds) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    (c) => c?.rcType === C.PARAMETER,
    (c) => c?.rcType === C.CALLABLE,
  );
}

export function findAllParametersOfCollections(allCodeInfo, codeInfoIds) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    (c) => c?.rcType === C.PARAMETER,
    (c) => c?.rcType === C.COLLECTION,
  );
}

export function findAllParameters(allCodeInfo, codeInfoIds) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    (c) => c?.rcType === C.PARAMETER,
    () => true,
  );
}

export function findAll(allCodeInfo, codeInfoIds) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    () => true,
    () => true,
  );
}
