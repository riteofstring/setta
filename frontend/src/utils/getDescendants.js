import C from "constants/constants.json";

function _findAllDescendants(
  allCodeInfo,
  codeInfoIds,
  outputCondition,
  stackCondition,
  includePath = false,
) {
  const output = [];
  const idStack = codeInfoIds
    .filter((x) => stackCondition(allCodeInfo[x]))
    .reverse();
  const visited = new Set();
  const pathMap = includePath ? new Map() : null;

  if (includePath) {
    idStack.forEach((id) => pathMap.set(id, [id]));
  }

  while (idStack.length > 0) {
    const id = idStack.pop();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const currInfo = allCodeInfo[id];

    if (outputCondition(currInfo)) {
      if (includePath) {
        const currentPath = pathMap.get(id);
        output.push({ id: currInfo.id, path: [...currentPath] });
      } else {
        output.push(currInfo.id);
      }
    }

    if (stackCondition(currInfo)) {
      const children = currInfo.children.slice().reverse();
      if (includePath) {
        const currentPath = pathMap.get(id);
        children.forEach((childId) => {
          pathMap.set(childId, [...currentPath, childId]);
        });
      }
      idStack.push(...children);
    }
  }
  return output;
}

export function findAllCallables(
  allCodeInfo,
  codeInfoIds,
  includePaths = false,
) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    (c) => c?.rcType === C.CALLABLE,
    () => true,
    includePaths,
  );
}

export function findAllParametersOfCallables(
  allCodeInfo,
  codeInfoIds,
  includePaths = false,
) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    (c) => c?.rcType === C.PARAMETER,
    (c) => c?.rcType === C.CALLABLE,
    includePaths,
  );
}

export function findAllParametersOfCollections(
  allCodeInfo,
  codeInfoIds,
  includePaths = false,
) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    (c) => c?.rcType === C.PARAMETER,
    (c) => c?.rcType === C.COLLECTION,
    includePaths,
  );
}

export function findAllParameters(
  allCodeInfo,
  codeInfoIds,
  includePaths = false,
) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    (c) => c?.rcType === C.PARAMETER,
    () => true,
    includePaths,
  );
}

export function findAll(allCodeInfo, codeInfoIds, includePaths = false) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoIds,
    () => true,
    () => true,
    includePaths,
  );
}
