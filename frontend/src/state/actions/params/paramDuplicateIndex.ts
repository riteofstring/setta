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

type ParamDuplicateIndexSelectorDeps = {
  codeObjImpls: ZustandProjectState["codeObjImpls"];
  codeObjs: ZustandProjectState["codeObjs"];
  codeObjVariants: ZustandProjectState["codeObjVariants"];
  sectionImpls: ZustandProjectState["sectionImpls"];
  sectionVariantMap: ZustandProjectState["projectConfig"]["sectionVariantMap"];
  sectionVariants: ZustandProjectState["sectionVariants"];
  sections: ZustandProjectState["sections"];
};

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

function getParamDuplicateIndexSelectorDeps(
  state: ZustandProjectState,
): ParamDuplicateIndexSelectorDeps {
  return {
    codeObjImpls: state.codeObjImpls,
    codeObjs: state.codeObjs,
    codeObjVariants: state.codeObjVariants,
    sectionImpls: state.sectionImpls,
    sectionVariantMap: state.projectConfig.sectionVariantMap,
    sectionVariants: state.sectionVariants,
    sections: state.sections,
  };
}

function areParamDuplicateIndexSelectorDepsEqual(
  left: ParamDuplicateIndexSelectorDeps,
  right: ParamDuplicateIndexSelectorDeps,
) {
  return (
    left.codeObjImpls === right.codeObjImpls &&
    left.codeObjs === right.codeObjs &&
    left.codeObjVariants === right.codeObjVariants &&
    left.sectionImpls === right.sectionImpls &&
    left.sectionVariantMap === right.sectionVariantMap &&
    left.sectionVariants === right.sectionVariants &&
    left.sections === right.sections
  );
}

export function createParamDuplicateIndexSelector(sectionId: string) {
  let previousDeps: ParamDuplicateIndexSelectorDeps | null = null;
  let previousResult: ParamDuplicateIndex | null = null;

  return (state: ZustandProjectState): ParamDuplicateIndex => {
    const nextDeps = getParamDuplicateIndexSelectorDeps(state);
    if (
      previousDeps &&
      previousResult &&
      areParamDuplicateIndexSelectorDepsEqual(previousDeps, nextDeps)
    ) {
      return previousResult;
    }

    const nextResult = buildParamDuplicateIndex(state, sectionId);
    previousDeps = nextDeps;
    previousResult = nextResult;
    return nextResult;
  };
}
