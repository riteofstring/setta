import { useParamInfos } from "models/info/paramInfos";
import { getSectionInfo } from "state/getters/sectionInfo";
import { maybeIncrementProjectStateVersion } from "../../state/actions/undo";
import { convertValue } from "./convertValue";

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

  useParamInfos.getState().setUITypeId({
    collectionId: uiTypeColId,
    paramInfoId,
    uiTypeId,
  });

  convertValue({ sectionId, paramInfoId, uiTypeId });
  maybeIncrementProjectStateVersion(incrementVersion);
}
