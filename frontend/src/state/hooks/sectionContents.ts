import _ from "lodash";
import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import { useProjectState } from "state/definitions";
import {
  isBaseChildlessCodeObjImpl,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { findAllParametersOfSection } from "utils/getDescendants";

export function useParamIdsAndNamesForSidePane(sectionId: string) {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
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
