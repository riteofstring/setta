import { useUITypeCols } from "state/definitions/uiTypeCols";
import { getSectionInfo } from "state/getters/sectionInfo";
import { convertValue } from "./convertValue";
import { maybeIncrementProjectStateVersion } from "./undo";

export function setParamUITypeId({
  uiTypeId,
  sectionId,
  paramInfoId,
  incrementVersion = false,
}: {
  uiTypeId: string;
  sectionId: string;
  paramInfoId: string;
  incrementVersion?: boolean;
}) {
  const { uiTypeColId } = getSectionInfo(sectionId);

  useUITypeCols.getState().setUITypeId({
    collectionId: uiTypeColId,
    paramInfoId,
    uiTypeId,
  });

  convertValue({ sectionId, paramInfoId, uiTypeId });
  maybeIncrementProjectStateVersion(incrementVersion);
}
