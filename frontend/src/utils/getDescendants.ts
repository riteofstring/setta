import {
  getEffectiveImplFromLayeringMap,
  getEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import { ZustandProjectState } from "state/definitions";
import {
  BaseCodeObjImplUnion,
  CallableSectionImpl,
  isBaseParentCodeObjImpl,
  SectionTypeEnum,
} from "./generatedTypes";

type ConditionFunctionForFindingCodeObjDescendants = (
  currImpl: BaseCodeObjImplUnion,
) => boolean;

function _findAllDescendants(
  impls: ZustandProjectState["codeObjImpls"],
  layerings: ZustandProjectState["codeObjImplLayerings"],
  layeringMap: CallableSectionImpl["codeObjImplLayeringMap"],
  ids: Array<string>,
  outputCondition?: ConditionFunctionForFindingCodeObjDescendants,
  stackCondition?: ConditionFunctionForFindingCodeObjDescendants,
  paramPathCondition?: ConditionFunctionForFindingCodeObjDescendants,
  earlyReturnCondition?: ConditionFunctionForFindingCodeObjDescendants,
) {
  const output: Array<string> = [];
  const visited: Set<string> = new Set();
  const pathMap: Record<string, Array<string>> = {};
  let idStack: Array<string>;
  if (stackCondition) {
    idStack = [];
    for (const id of ids.reverse()) {
      const impl = getEffectiveImplFromLayeringMap(
        id,
        impls,
        layerings,
        layeringMap,
      );
      if (stackCondition(impl)) {
        idStack.push(id);
      }
    }
  } else {
    idStack = [...ids].reverse();
  }

  if (paramPathCondition) {
    for (const id of idStack) {
      if (
        paramPathCondition(
          getEffectiveImplFromLayeringMap(id, impls, layerings, layeringMap),
        )
      ) {
        pathMap[id] = [id];
      } else {
        pathMap[id] = [];
      }
    }
  }

  while (idStack.length > 0) {
    const id = idStack.pop();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const impl = getEffectiveImplFromLayeringMap(
      id,
      impls,
      layerings,
      layeringMap,
    );

    if (outputCondition?.(impl)) {
      output.push(id);
    }

    if (stackCondition?.(impl) && isBaseParentCodeObjImpl(impl)) {
      const children = impl.children.slice().reverse();
      if (paramPathCondition) {
        const currentPath = pathMap[id] ?? [];
        for (const childId of children) {
          const childImpl = getEffectiveImplFromLayeringMap(
            childId,
            impls,
            layerings,
            layeringMap,
          );
          if (paramPathCondition(childImpl)) {
            pathMap[childId] = [...currentPath, childId];
          } else {
            pathMap[childId] = [...currentPath];
          }
        }
      }
      idStack.push(...children);
    }

    if (output.length > 0) {
      const lastId = output[output.length - 1];
      if (
        lastId &&
        earlyReturnCondition?.(
          getEffectiveImplFromLayeringMap(
            lastId,
            impls,
            layerings,
            layeringMap,
          ),
        )
      ) {
        return { ids: output, pathMap, earlyReturnTriggered: true };
      }
    }
  }

  return { ids: output, pathMap, earlyReturnTriggered: false };
}

export function findAllParameters({
  allCodeInfo,
  codeInfoChildren,
  startingId,
  additionalOutputCondition = null,
  paramPathCondition = null,
  earlyReturnCondition = null,
}) {
  const codeInfoIds = startingId ? [startingId] : codeInfoChildren[startingId];
  // if startingId is null, then we're starting at the root
  // so we don't want to avoid the parameters of callables
  const stackCondition = startingId
    ? () => true
    : (c) => c?.rcType === CodeInfoTypeEnum.PARAMETER;

  return _findAllDescendants(
    allCodeInfo,
    codeInfoChildren,
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

export function findAllParametersOfCallableSection(
  p: ZustandProjectState,
  sectionId: string,
) {
  const impl = getEffectiveSectionImpl(p, sectionId);
  if (impl.type !== SectionTypeEnum.Callable) {
    throw new Error();
  }
  const { callable, codeObjImplLayeringMap } = impl;
  return _findAllDescendants();
}
