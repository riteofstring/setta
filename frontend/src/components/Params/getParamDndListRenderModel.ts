import { buildParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import { buildParamTreeView } from "state/actions/params/paramTree";
import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  getFilteredRenderableParamIdLookup,
  getNestedParentParamIdLookup,
} from "./getFilteredRenderableParamIds";

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
  const nestedParentParamIdLookup = getNestedParentParamIdLookup(
    requiredParamIdsToPaths,
  );
  const visibleParamIdLookup = getFilteredRenderableParamIdLookup({
    state,
    sectionId,
    requiredParamIdsToPaths,
  });
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const paramFilterActive = visibleParamIdLookup !== null;

  if (!allowTree || paramFilterActive) {
    return {
      duplicateIndex,
      nestedParentParamIdLookup,
      paramFilterActive,
      tree: null,
      visibleParamIdLookup,
    };
  }

  if (impl.type === SectionTypeEnum.Callable) {
    if (!impl.callable) {
      return {
        duplicateIndex,
        nestedParentParamIdLookup,
        paramFilterActive,
        tree: null,
        visibleParamIdLookup,
      };
    }
  } else if (
    impl.type === SectionTypeEnum.Dict ||
    impl.type === SectionTypeEnum.GlobalVariables
  ) {
    if (!impl.topLevelParamId) {
      return {
        duplicateIndex,
        nestedParentParamIdLookup,
        paramFilterActive,
        tree: null,
        visibleParamIdLookup,
      };
    }
  } else {
    return {
      duplicateIndex,
      nestedParentParamIdLookup,
      paramFilterActive,
      tree: null,
      visibleParamIdLookup,
    };
  }

  return {
    duplicateIndex,
    nestedParentParamIdLookup,
    paramFilterActive,
    tree: buildParamTreeView(
      state,
      sectionId,
      paramIds,
      requiredParamIdsToPaths,
    ),
    visibleParamIdLookup,
  };
}
