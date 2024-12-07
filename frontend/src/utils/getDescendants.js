import C from "constants/constants.json";

function _findAllDescendants(
  allCodeInfo,
  codeInfoChildren,
  codeInfoIds,
  outputCondition,
  stackCondition,
  paramPathCondition = null, // null or a function
  earlyReturnCondition = null, // null or a function
) {
  const output = [];
  const idStack = codeInfoIds
    .filter((x) => stackCondition(allCodeInfo[x]))
    .reverse();
  const visited = new Set();
  const pathMap = paramPathCondition ? {} : null;

  if (paramPathCondition) {
    idStack.forEach(
      (id) => (pathMap[id] = paramPathCondition(allCodeInfo[id]) ? [id] : []),
    );
  }

  while (idStack.length > 0) {
    const id = idStack.pop();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const currInfo = allCodeInfo[id];

    if (outputCondition(currInfo)) {
      output.push(currInfo.id);
    }

    if (stackCondition(currInfo)) {
      const children = codeInfoChildren[currInfo.id].slice().reverse();
      if (paramPathCondition) {
        const currentPath = pathMap[id];
        children.forEach((childId) => {
          pathMap[childId] = paramPathCondition(allCodeInfo[childId])
            ? [...currentPath, childId]
            : [...currentPath];
        });
      }
      idStack.push(...children);
    }

    if (
      output.length > 0 &&
      earlyReturnCondition?.(output[output.length - 1])
    ) {
      return { ids: output, pathMap, earlyReturnTriggered: true };
    }
  }

  return { ids: output, pathMap, earlyReturnTriggered: false };
}

export function findAllParameters(
  allCodeInfo,
  codeInfoChildren,
  startingId,
  paramPathCondition = null,
  earlyReturnCondition = null,
) {
  const codeInfoIds = startingId ? [startingId] : codeInfoChildren[startingId];
  return _findAllDescendants(
    allCodeInfo,
    codeInfoChildren,
    codeInfoIds ?? [],
    (c) => c?.rcType === C.PARAMETER,
    () => true,
    paramPathCondition,
    earlyReturnCondition,
  );
}

export function findAll(
  allCodeInfo,
  codeInfoChildren,
  codeInfoIds,
  paramPathCondition = null,
  earlyReturnCondition = null,
) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoChildren,
    codeInfoIds,
    () => true,
    () => true,
    paramPathCondition,
    earlyReturnCondition,
  );
}

export function findAllParametersAndPathMaps(...props) {
  return findAllParameters(...props, (p) => p.rcType === C.PARAMETER);
}
