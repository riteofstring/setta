import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type BaseSectionWithParamsImpl,
} from "utils/generatedTypes";

type ParamFlatItem = {
  id: string;
  parentId: string;
  depth: number;
  isParent: boolean;
};

export type ParamTreeView = {
  rootId: string;
  parentById: Record<string, string | null>;
  flat: ParamFlatItem[];
  visibleChildrenByParent: Record<string, string[]>;
};

function hasParamVariant(
  sectionImpl: BaseSectionWithParamsImpl,
  paramId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    sectionImpl.codeObjVariantMap,
    paramId,
  );
}

export function getParamRootId(
  state: ZustandProjectState,
  sectionId: string,
): string {
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (impl.type === SectionTypeEnum.Callable) {
    if (!impl.callable) {
      throw new Error(`Section ${sectionId} missing callable root.`);
    }
    return impl.callable;
  }
  if (impl.type === SectionTypeEnum.Dict) {
    if (!impl.topLevelParamId) {
      throw new Error(`Section ${sectionId} missing top level param root.`);
    }
    return impl.topLevelParamId;
  }
  throw new Error(`Section ${sectionId} does not support param reordering.`);
}

export function buildParamParentMap(
  state: ZustandProjectState,
  sectionId: string,
  rootId: string,
): Record<string, string | null> {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (!hasParamVariant(sectionImpl, rootId)) {
    return { [rootId]: null };
  }
  const rootImpl = getCurrEffectiveCodeObjImpl(state, sectionId, rootId);
  if (!isBaseParentCodeObjImpl(rootImpl)) {
    throw new Error(`Root param ${rootId} is not a parent.`);
  }
  const parentById: Record<string, string | null> = { [rootId]: null };

  function walk(parentId: string) {
    if (!hasParamVariant(sectionImpl, parentId)) {
      return;
    }
    const parentImpl = getCurrEffectiveCodeObjImpl(state, sectionId, parentId);
    if (!isBaseParentCodeObjImpl(parentImpl)) {
      return;
    }
    for (const childId of parentImpl.children) {
      if (!hasParamVariant(sectionImpl, childId)) {
        continue;
      }
      parentById[childId] = parentId;
      walk(childId);
    }
  }

  walk(rootId);
  return parentById;
}

export function buildParamTreeView(
  state: ZustandProjectState,
  sectionId: string,
  topLevelParamIds: string[],
  requiredParamIdsToPaths: Record<string, string[]>,
): ParamTreeView {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const rootId = getParamRootId(state, sectionId);
  const parentById = buildParamParentMap(state, sectionId, rootId);
  const visibleSet = new Set(Object.keys(requiredParamIdsToPaths));
  const flat: ParamFlatItem[] = [];
  const visibleChildrenByParent: Record<string, string[]> = {};

  function walk(paramId: string, depth: number, parentId: string) {
    if (!visibleSet.has(paramId)) {
      return;
    }
    if (!hasParamVariant(sectionImpl, paramId)) {
      return;
    }
    const impl = getCurrEffectiveCodeObjImpl(state, sectionId, paramId);
    const isParent = isBaseParentCodeObjImpl(impl);
    if (!visibleChildrenByParent[parentId]) {
      visibleChildrenByParent[parentId] = [];
    }
    visibleChildrenByParent[parentId].push(paramId);
    flat.push({ id: paramId, parentId, depth, isParent });
    if (isParent) {
      for (const childId of impl.children) {
        walk(childId, depth + 1, paramId);
      }
    }
  }

  for (const paramId of topLevelParamIds) {
    walk(paramId, 0, rootId);
  }

  return { rootId, parentById, flat, visibleChildrenByParent };
}

export function getRootSelectedParamIds(
  parentById: Record<string, string | null>,
  selectedIds: string[],
): string[] {
  const selectedSet = new Set(selectedIds);
  return selectedIds.filter((paramId) => {
    let parentId = parentById[paramId] ?? null;
    while (parentId) {
      if (selectedSet.has(parentId)) {
        return false;
      }
      parentId = parentById[parentId] ?? null;
    }
    return true;
  });
}

export function getSharedParentId(
  parentById: Record<string, string | null>,
  paramIds: string[],
): string | null {
  if (paramIds.length === 0) {
    return null;
  }
  const firstParent = parentById[paramIds[0]] ?? null;
  if (!firstParent) {
    return null;
  }
  for (const paramId of paramIds) {
    if (parentById[paramId] !== firstParent) {
      return null;
    }
  }
  return firstParent;
}

export function isDescendantOfSelection(
  parentById: Record<string, string | null>,
  candidateId: string,
  selectedSet: Set<string>,
): boolean {
  let currentId: string | null = candidateId;
  while (currentId) {
    if (selectedSet.has(currentId)) {
      return true;
    }
    currentId = parentById[currentId] ?? null;
  }
  return false;
}

export function resolveFullIndexForVisibleInsertion({
  targetVisibleIndex,
  movingIds,
  visibleSiblings,
  fullChildren,
}: {
  targetVisibleIndex: number;
  movingIds: Set<string>;
  visibleSiblings: string[];
  fullChildren: string[];
}): number | null {
  const remainingChildren = fullChildren.filter((id) => !movingIds.has(id));
  const remainingVisible = visibleSiblings.filter((id) => !movingIds.has(id));
  if (targetVisibleIndex < 0 || targetVisibleIndex > remainingVisible.length) {
    return null;
  }
  if (remainingVisible.length === 0) {
    return remainingChildren.length;
  }
  if (targetVisibleIndex === remainingVisible.length) {
    const lastVisible = remainingVisible[remainingVisible.length - 1];
    const lastIndex = remainingChildren.indexOf(lastVisible);
    return lastIndex >= 0 ? lastIndex + 1 : remainingChildren.length;
  }
  const anchorId = remainingVisible[targetVisibleIndex];
  const anchorIndex = remainingChildren.indexOf(anchorId);
  if (anchorIndex < 0) {
    return remainingChildren.length;
  }
  return anchorIndex;
}
