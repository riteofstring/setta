import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseParentCodeObjImpl,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  type BaseParamCodeObjImpl,
} from "utils/generatedTypes";

export type ParamSwitchProjectState = {
  hasChildren: boolean;
  isKwarg: boolean;
  isNestedParam: boolean;
  paramChildren: string[];
  paramIsSelected: boolean;
};

type ParamSwitchProjectSelectorDeps = {
  codeObjImpl: BaseParamCodeObjImpl | null;
  selectedParams: Array<string> | null;
};

function getParamSwitchProjectSelectorDeps(
  state: ZustandProjectState,
  sectionId: string,
  paramInfoId: string,
): ParamSwitchProjectSelectorDeps {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );

  return {
    codeObjImpl: getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
      state,
      sectionId,
      paramInfoId,
      isBaseParamCodeObjImpl,
    ),
    selectedParams: sectionImpl?.selectedParams ?? null,
  };
}

function areParamSwitchProjectSelectorDepsEqual(
  left: ParamSwitchProjectSelectorDeps,
  right: ParamSwitchProjectSelectorDeps,
) {
  return (
    left.codeObjImpl === right.codeObjImpl &&
    left.selectedParams === right.selectedParams
  );
}

function buildParamSwitchProjectStateFromDeps(
  deps: ParamSwitchProjectSelectorDeps,
  paramInfoId: string,
): ParamSwitchProjectState | null {
  const { codeObjImpl, selectedParams } = deps;
  if (!codeObjImpl || !selectedParams) {
    return null;
  }

  const isNestedParam = isBaseParentCodeObjImpl(codeObjImpl);
  const paramChildren = isNestedParam ? codeObjImpl.children : [];

  return {
    hasChildren: paramChildren.length > 0,
    isKwarg: Boolean(codeObjImpl.coreNameEditable),
    isNestedParam,
    paramChildren,
    paramIsSelected: selectedParams.includes(paramInfoId),
  };
}

export function buildParamSwitchProjectState(
  state: ZustandProjectState,
  sectionId: string,
  paramInfoId: string,
): ParamSwitchProjectState | null {
  return buildParamSwitchProjectStateFromDeps(
    getParamSwitchProjectSelectorDeps(state, sectionId, paramInfoId),
    paramInfoId,
  );
}

export function createParamSwitchProjectStateSelector(
  sectionId: string,
  paramInfoId: string,
) {
  let cachedDeps: ParamSwitchProjectSelectorDeps | null = null;
  let cachedResult: ParamSwitchProjectState | null = null;
  let hasCachedResult = false;

  return (state: ZustandProjectState): ParamSwitchProjectState | null => {
    const nextDeps = getParamSwitchProjectSelectorDeps(
      state,
      sectionId,
      paramInfoId,
    );
    if (
      hasCachedResult &&
      cachedDeps &&
      areParamSwitchProjectSelectorDepsEqual(cachedDeps, nextDeps)
    ) {
      return cachedResult;
    }

    const nextResult = buildParamSwitchProjectStateFromDeps(
      nextDeps,
      paramInfoId,
    );
    cachedDeps = nextDeps;
    cachedResult = nextResult;
    hasCachedResult = true;
    return nextResult;
  };
}
