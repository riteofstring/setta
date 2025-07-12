import { getEffectiveImplFromLayeringMap } from "state/actions/sectionInfos";
import { ZustandProjectState } from "state/definitions";
import {
  BaseCodeObjImplUnion,
  BaseDictSectionImpl,
  BaseSectionWithParamsImplUnion,
  CallableSectionImpl,
  isBaseDictSectionImpl,
  isBaseParentCodeObjImpl,
  SectionTypeEnum,
} from "./generatedTypes";

type ConditionFunction = (currImpl: BaseCodeObjImplUnion) => boolean;

type ConditionFunctions = {
  output?: ConditionFunction;
  stack?: ConditionFunction;
  paramPath?: ConditionFunction;
  earlyReturn?: ConditionFunction;
};

export type CodeObjPathMap = Record<string, Array<string>>;

function _findAllDescendants(
  impls: ZustandProjectState["codeObjImpls"],
  cores: ZustandProjectState["codeObjs"],
  layerings: ZustandProjectState["codeObjImplLayerings"],
  layeringMap: CallableSectionImpl["codeObjImplLayeringMap"],
  ids: Array<string>,
  conditions: ConditionFunctions,
) {
  const output: Array<string> = [];
  const visited: Set<string> = new Set();
  const pathMap: CodeObjPathMap = {};
  const childrenMap: Record<string, Array<string>> = {};
  let idStack: Array<string>;
  if (conditions.stack) {
    idStack = [];
    for (const id of ids.reverse()) {
      const impl = getEffectiveImplFromLayeringMap(
        id,
        impls,
        cores,
        layerings,
        layeringMap,
      );
      if (conditions.stack(impl)) {
        idStack.push(id);
      }
    }
  } else {
    idStack = [...ids].reverse();
  }

  if (conditions.paramPath) {
    for (const id of idStack) {
      if (
        conditions.paramPath(
          getEffectiveImplFromLayeringMap(
            id,
            impls,
            cores,
            layerings,
            layeringMap,
          ),
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
      cores,
      layerings,
      layeringMap,
    );

    if (conditions.output?.(impl)) {
      output.push(id);
    }

    if (
      (!conditions.stack || conditions.stack(impl)) &&
      isBaseParentCodeObjImpl(impl)
    ) {
      let children = impl.children;
      childrenMap[id] = children;
      children = children.slice().reverse();
      if (conditions.paramPath) {
        const currentPath = pathMap[id] ?? [];
        for (const childId of children) {
          const childImpl = getEffectiveImplFromLayeringMap(
            childId,
            impls,
            cores,
            layerings,
            layeringMap,
          );
          if (conditions.paramPath(childImpl)) {
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
        conditions.earlyReturn?.(
          getEffectiveImplFromLayeringMap(
            lastId,
            impls,
            cores,
            layerings,
            layeringMap,
          ),
        )
      ) {
        return {
          ids: output,
          pathMap,
          childrenMap,
          earlyReturnTriggered: true,
        };
      }
    }
  }

  return { ids: output, pathMap, childrenMap, earlyReturnTriggered: false };
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

export function findAllParametersOfSection(
  p: ZustandProjectState,
  impl: BaseSectionWithParamsImplUnion,
  conditions: ConditionFunctions,
) {
  if (impl.type === SectionTypeEnum.Callable) {
    return findAllParametersOfCallableSection(p, impl, conditions);
  } else if (isBaseDictSectionImpl(impl)) {
    return findAllParametersOfBaseDictSection(p, impl, conditions);
  }
  throw new Error();
}

export function findAllParametersOfCallableSection(
  p: ZustandProjectState,
  impl: CallableSectionImpl,
  conditions: ConditionFunctions,
) {
  const { callable, codeObjImplLayeringMap } = impl;
  return _findAllDescendants(
    p.codeObjImpls,
    p.codeObjs,
    p.codeObjImplLayerings,
    codeObjImplLayeringMap,
    callable ? [callable] : [],
    conditions,
  );
}

export function findAllParametersOfBaseDictSection(
  p: ZustandProjectState,
  impl: BaseDictSectionImpl,
  conditions: ConditionFunctions,
) {
  const { topLevelParamIds, codeObjImplLayeringMap } = impl;
  return _findAllDescendants(
    p.codeObjImpls,
    p.codeObjs,
    p.codeObjImplLayerings,
    codeObjImplLayeringMap,
    topLevelParamIds,
    conditions,
  );
}
