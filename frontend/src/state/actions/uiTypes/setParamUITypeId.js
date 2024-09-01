import { useUITypeCols } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { convertValue } from "../sectionVariants";
import { maybeIncrementProjectStateVersion } from "../undo";

export function setParamUITypeId({
  uiTypeId,
  sectionId,
  paramInfoId,
  incrementVersion = false,
}) {
  const { uiTypeColId } = getSectionInfo(sectionId);

  useUITypeCols.setState((state) => {
    state.y[uiTypeColId][paramInfoId].uiTypeId = uiTypeId;
  });

  convertValue({ sectionId, paramInfoId, uiTypeId });
  maybeIncrementProjectStateVersion(incrementVersion);
}
