import { buildParamParentMap } from "state/actions/params/paramTree";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";

export type ParamDuplicateIndex = {
  parentById: Record<string, string | null>;
  namesByParent: Record<string, Record<string, string[]>>;
};

type SectionParamRootFields = {
  readonly callable?: string | null | undefined;
  readonly topLevelParamId?: string | null | undefined;
  readonly type: string;
};

function getRootParamId(sectionImpl: SectionParamRootFields): string | null {
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
  return buildParamDuplicateIndexForSectionImpl(state, sectionId, sectionImpl);
}

export function buildParamDuplicateIndexIfPresent(
  state: ZustandProjectState,
  sectionId: string,
): ParamDuplicateIndex {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (!sectionImpl) {
    return { parentById: {}, namesByParent: {} };
  }
  return buildParamDuplicateIndexForSectionImpl(state, sectionId, sectionImpl);
}

export function getParamDuplicateNameError(
  paramInfoId: string,
  value: string,
  duplicateIndex: ParamDuplicateIndex,
): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (!(paramInfoId in duplicateIndex.parentById)) {
    return null;
  }
  const parentId = duplicateIndex.parentById[paramInfoId];
  if (!parentId) {
    return null;
  }
  const namesForParent = duplicateIndex.namesByParent[parentId];
  if (!namesForParent) {
    return null;
  }
  const matchingIds = namesForParent[normalized];
  if (!matchingIds) {
    return null;
  }
  if (matchingIds.length === 1 && matchingIds[0] === paramInfoId) {
    return null;
  }
  return `Param name "${normalized}" already exists under this parent.`;
}

function buildParamDuplicateIndexForSectionImpl(
  state: ZustandProjectState,
  sectionId: string,
  sectionImpl: SectionParamRootFields,
): ParamDuplicateIndex {
  const rootId = getRootParamId(sectionImpl);
  if (!rootId) {
    return { parentById: {}, namesByParent: {} };
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
  return { parentById, namesByParent };
}
