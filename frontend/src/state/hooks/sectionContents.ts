import _ from "lodash";
import { getCurrSectionVariantId } from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import { useProjectState } from "state/definitions";

export function useParamIdsAndNamesForSidePane(sectionId: string) {
  return useProjectState((x) => {
    const variantId = getCurrSectionVariantId(x, sectionId);
    const shown = x.shownParamIds[variantId];
    const output: Array<{ id: string; name: string }> = [];
    if (!shown) {
      return output;
    }
    const allIdPaths = {
      ...shown.pinned.requiredParamIdsToPaths,
      ...shown.unpinned.requiredParamIdsToPaths,
    };
    for (const [s, idPath] of Object.entries(allIdPaths)) {
      output.push({
        id: s,
        name: paramNameFromPathArray(x, sectionId, idPath),
      });
    }
    return output;
  }, _.isEqual);
}
