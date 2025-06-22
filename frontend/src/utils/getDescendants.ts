import { ZustandProjectState } from "state/definitions";
import {
  BaseCodeObjImplUnion,
  CodeObjCore,
  isBaseParentCodeObjImpl,
} from "./generatedTypes";

type ConditionFunctionForFindingCodeObjDescendants = (
  currObj: CodeObjCore,
  currImpl: BaseCodeObjImplUnion,
) => boolean;

function _findAllDescendants(
  codeObjs: ZustandProjectState["codeObjImpls"],
  allCodeObjImpls: Record<string, BaseCodeObjImplUnion>,
  codeInfoIds: Array<string>,
  outputCondition: ConditionFunctionForFindingCodeObjDescendants,
  stackCondition: ConditionFunctionForFindingCodeObjDescendants,
  paramPathCondition?: ConditionFunctionForFindingCodeObjDescendants,
  earlyReturnCondition?: ConditionFunctionForFindingCodeObjDescendants,
) {
  const output: Array<string> = [];
  const idStack = codeInfoIds
    .filter((x) => stackCondition(codeObjs[x]!, allCodeObjImpls[x]!))
    .reverse();
  const visited = new Set();
  const pathMap = {};

  if (paramPathCondition) {
    idStack.forEach(
      (id) =>
        (pathMap[id] = paramPathCondition(
          codeObjs[id]!,
          allCodeObjImpls[id]!,
        )
          ? [id]
          : []),
    );
  }

  while (idStack.length > 0) {
    const id = idStack.pop();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const currObj = codeObjs[id];
    const currImpl = allCodeObjImpls[id];

    if (outputCondition(currObj!, currImpl!)) {
      output.push(currObj!.id);
    }

    if (
      stackCondition(currObj!, currImpl!) &&
      isBaseParentCodeObjImpl(currImpl!)
    ) {
      const children = currImpl.children.slice().reverse();
      if (paramPathCondition) {
        const currentPath = pathMap[id];
        children.forEach((childId) => {
          pathMap[childId] = paramPathCondition(
            codeObjs[childId]!,
            allCodeObjImpls[childId]!,
          )
            ? [...currentPath, childId]
            : [...currentPath];
        });
      }
      idStack.push(...children);
    }

    if (output.length > 0) {
      const lastId = output[output.length - 1];
      earlyReturnCondition?.(codeObjs[lastId!]!, allCodeObjImpls[lastId!]!);
      return { ids: output, pathMap, earlyReturnTriggered: true };
    }
  }

  return { ids: output, pathMap, earlyReturnTriggered: false };
}

export function findAllParameters({
  allCodeObjs,
  allCodeObjImpls,
  startingId,
  additionalOutputCondition,
  paramPathCondition,
  earlyReturnCondition,
}: {
  allCodeObjs: Record<string, CodeObjCore>;
  allCodeObjImpls: Record<string, BaseCodeObjImplUnion>;
  startingId: string | null;
  additionalOutputCondition?: ConditionFunctionForFindingCodeObjDescendants;
  paramPathCondition?: ConditionFunctionForFindingCodeObjDescendants;
  earlyReturnCondition?: ConditionFunctionForFindingCodeObjDescendants;
}) {
  const codeInfoIds = startingId ? [startingId] : allCodeObjImpls[startingId];
  // if startingId is null, then we're starting at the root
  // so we don't want to avoid the parameters of callables
  const stackCondition = () => true;

  return _findAllDescendants(
    allCodeObjs,
    allCodeObjImpls,
    codeInfoIds ?? [],
    (c) =>
      c?.rcType === CodeInfoTypeEnum.PARAMETER &&
      (!additionalOutputCondition || additionalOutputCondition(c)),
    stackCondition,
    paramPathCondition,
    earlyReturnCondition,
  );
}

export function findAll(allCodeInfo, codeInfoChildren) {
  return _findAllDescendants(
    allCodeInfo,
    codeInfoChildren,
    codeInfoChildren[null] ?? [],
    () => true,
    () => true,
  );
}

export function findAllParametersAndPathMaps(props) {
  return findAllParameters({
    ...props,
    paramPathCondition: (p) => p.rcType === CodeInfoTypeEnum.PARAMETER,
  });
}


export function findAllDescendantsOfCallable(){
  
}