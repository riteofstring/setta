import _ from "lodash";
import { getEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  getParamIdsToShowInArea,
  paramNameFromPathArray,
} from "state/actions/sections/sectionContents";
import { useProjectState } from "state/definitions";
import {
  isBaseChildlessCodeObjImpl,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { findAllParametersOfSection } from "utils/getDescendants";

export function useParamInfosForSidePane(sectionId: string) {
  return useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    if (!isBaseSectionWithParamsImpl(impl)) {
      throw new Error();
    }
    const { ids, pathMap } = findAllParametersOfSection(x, impl, {
      output: isBaseChildlessCodeObjImpl,
      paramPath: isBaseParamCodeObjImpl,
    });
    const output: Array<{ id: string; name: string }> = [];
    for (const id of ids) {
      output.push({
        id,
        name: paramNameFromPathArray(x.codeObjs, pathMap, id),
      });
    }
    return output;
  }, _.isEqual);
}

export function useParamIdsToShowInArea(sectionId: string, isPinned: boolean) {
  return useProjectState((x) => {
    return getParamIdsToShowInArea(
      x,
      getEffectiveSectionImpl(x, sectionId),
      isPinned,
    );
  }, _.isEqual);
}
