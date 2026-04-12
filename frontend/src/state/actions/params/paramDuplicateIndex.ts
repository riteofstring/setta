import { buildParamParentMap } from "state/actions/params/paramTree";
import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type BaseSectionWithParamsImpl,
} from "utils/generatedTypes";

export type ParamDuplicateIndex = {
  parentById: Record<string, string | null>;
  namesByParent: Record<string, Record<string, string[]>>;
};

const duplicateIndexCacheBySectionImpl = new WeakMap<
  object,
  WeakMap<object, WeakMap<object, WeakMap<object, ParamDuplicateIndex>>>
>();

function getRootParamId(sectionImpl: BaseSectionWithParamsImpl): string | null {
  if (sectionImpl.type === SectionTypeEnum.Callable) {
    return sectionImpl.callable ?? null;
  }
  if (
    sectionImpl.type === SectionTypeEnum.Dict ||
    sectionImpl.type === SectionTypeEnum.GlobalVariables
  ) {
    return sectionImpl.topLevelParamId ?? null;
  }
  return null;
}

export function buildParamDuplicateIndex(
  state: ZustandProjectState,
  sectionId: string,
): ParamDuplicateIndex {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const cachedIndex = readCachedParamDuplicateIndex({
    codeObjImpls: state.codeObjImpls,
    codeObjVariants: state.codeObjVariants,
    codeObjs: state.codeObjs,
    sectionImpl,
  });
  if (cachedIndex) {
    return cachedIndex;
  }
  const rootId = getRootParamId(sectionImpl);
  if (!rootId) {
    const emptyIndex = { parentById: {}, namesByParent: {} };
    writeCachedParamDuplicateIndex({
      codeObjImpls: state.codeObjImpls,
      codeObjVariants: state.codeObjVariants,
      codeObjs: state.codeObjs,
      duplicateIndex: emptyIndex,
      sectionImpl,
    });
    return emptyIndex;
  }
  const parentById = buildParamParentMap(state, sectionId, rootId);
  const namesByParent: Record<string, Record<string, string[]>> = {};
  for (const [paramId, parentId] of Object.entries(parentById)) {
    if (!parentId) {
      continue;
    }
    const paramName = state.codeObjs[paramId]?.name?.trim();
    if (!paramName) {
      continue;
    }
    if (!namesByParent[parentId]) {
      namesByParent[parentId] = {};
    }
    const namesForParent = namesByParent[parentId];
    if (!namesForParent[paramName]) {
      namesForParent[paramName] = [];
    }
    namesForParent[paramName].push(paramId);
  }
  const duplicateIndex = { parentById, namesByParent };
  writeCachedParamDuplicateIndex({
    codeObjImpls: state.codeObjImpls,
    codeObjVariants: state.codeObjVariants,
    codeObjs: state.codeObjs,
    duplicateIndex,
    sectionImpl,
  });
  return duplicateIndex;
}

function readCachedParamDuplicateIndex({
  codeObjImpls,
  codeObjVariants,
  codeObjs,
  sectionImpl,
}: {
  codeObjImpls: object;
  codeObjVariants: object;
  codeObjs: object;
  sectionImpl: object;
}): ParamDuplicateIndex | null {
  const cacheByCodeObjs = duplicateIndexCacheBySectionImpl.get(sectionImpl);
  if (!cacheByCodeObjs) {
    return null;
  }
  const cacheByCodeObjVariants = cacheByCodeObjs.get(codeObjs);
  if (!cacheByCodeObjVariants) {
    return null;
  }
  const cacheByCodeObjImpls = cacheByCodeObjVariants.get(codeObjVariants);
  if (!cacheByCodeObjImpls) {
    return null;
  }
  return cacheByCodeObjImpls.get(codeObjImpls) ?? null;
}

function writeCachedParamDuplicateIndex({
  codeObjImpls,
  codeObjVariants,
  codeObjs,
  duplicateIndex,
  sectionImpl,
}: {
  codeObjImpls: object;
  codeObjVariants: object;
  codeObjs: object;
  duplicateIndex: ParamDuplicateIndex;
  sectionImpl: object;
}) {
  let cacheByCodeObjs = duplicateIndexCacheBySectionImpl.get(sectionImpl);
  if (!cacheByCodeObjs) {
    cacheByCodeObjs = new WeakMap<
      object,
      WeakMap<object, WeakMap<object, ParamDuplicateIndex>>
    >();
    duplicateIndexCacheBySectionImpl.set(sectionImpl, cacheByCodeObjs);
  }
  let cacheByCodeObjVariants = cacheByCodeObjs.get(codeObjs);
  if (!cacheByCodeObjVariants) {
    cacheByCodeObjVariants = new WeakMap<
      object,
      WeakMap<object, ParamDuplicateIndex>
    >();
    cacheByCodeObjs.set(codeObjs, cacheByCodeObjVariants);
  }
  let cacheByCodeObjImpls = cacheByCodeObjVariants.get(codeObjVariants);
  if (!cacheByCodeObjImpls) {
    cacheByCodeObjImpls = new WeakMap<object, ParamDuplicateIndex>();
    cacheByCodeObjVariants.set(codeObjVariants, cacheByCodeObjImpls);
  }
  cacheByCodeObjImpls.set(codeObjImpls, duplicateIndex);
}
