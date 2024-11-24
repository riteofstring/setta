import { useSectionInfos } from "state/definitions";
import { convertValue } from "../sectionVariants";
import { maybeIncrementProjectStateVersion } from "../undo";

export function setParamUITypeId({
  uiTypeId,
  sectionId,
  paramInfoId,
  incrementVersion = false,
}) {
  useSectionInfos.setState((state) => {
    const { uiTypeColId } = state.x[sectionId];
    if (!(paramInfoId in state.uiTypeCols[uiTypeColId])) {
      state.uiTypeCols[uiTypeColId][paramInfoId] = {
        uiTypeId,
        nonPresetUITypeIds: [],
      };
    } else {
      state.uiTypeCols[uiTypeColId][paramInfoId].uiTypeId = uiTypeId;
    }
  });

  convertValue({ sectionId, paramInfoId, uiTypeId });
  maybeIncrementProjectStateVersion(incrementVersion);
}
