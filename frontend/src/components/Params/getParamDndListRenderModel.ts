import { buildParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import { buildParamTreeView } from "state/actions/params/paramTree";
import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";

type GetParamDndListRenderModelArgs = {
  state: ZustandProjectState;
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  allowTree: boolean;
};

export function getParamDndListRenderModel({
  state,
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  allowTree,
}: GetParamDndListRenderModelArgs) {
  const duplicateIndex = buildParamDuplicateIndex(state, sectionId);
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const paramFilterActive = impl.paramFilter.trim().length > 0;

  if (!allowTree || paramFilterActive) {
    return {
      duplicateIndex,
      paramFilterActive,
      tree: null,
    };
  }

  if (impl.type === SectionTypeEnum.Callable) {
    if (!impl.callable) {
      return {
        duplicateIndex,
        paramFilterActive,
        tree: null,
      };
    }
  } else if (
    impl.type === SectionTypeEnum.Dict ||
    impl.type === SectionTypeEnum.GlobalVariables
  ) {
    if (!impl.topLevelParamId) {
      return {
        duplicateIndex,
        paramFilterActive,
        tree: null,
      };
    }
  } else {
    return {
      duplicateIndex,
      paramFilterActive,
      tree: null,
    };
  }

  return {
    duplicateIndex,
    paramFilterActive,
    tree: buildParamTreeView(
      state,
      sectionId,
      paramIds,
      requiredParamIdsToPaths,
    ),
  };
}
