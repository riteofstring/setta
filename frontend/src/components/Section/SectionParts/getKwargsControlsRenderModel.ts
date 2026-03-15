import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";

type GetKwargsControlsRenderModelArgs = {
  state: ZustandProjectState;
  sectionId: string;
};

export function getKwargsControlsRenderModel({
  state,
  sectionId,
}: GetKwargsControlsRenderModelArgs) {
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const isCallableSection = impl.type === SectionTypeEnum.Callable;
  const selectedParams = impl.selectedParams;
  const deletableSelectedParamIds = selectedParams.filter((paramId) => {
    const paramImpl = getCurrEffectiveCodeObjImpl(state, sectionId, paramId);
    return isBaseParamCodeObjImpl(paramImpl) && paramImpl.coreNameEditable;
  });

  return {
    callableMissing: isCallableSection && impl.callable == null,
    isCallableSection,
    styleColor: impl.styleColor ?? null,
    selectedParams,
    edgeInputParams: impl.edgeInputParams,
    pinnedParams: impl.pinnedParams,
    paramFilterValue: impl.paramFilter,
    deletableSelectedParamIds,
  };
}
