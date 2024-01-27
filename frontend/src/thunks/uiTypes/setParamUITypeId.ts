import { useParamInfos } from "models/info/paramInfos";
import { updateCurrChildren } from "thunks/sections/children";
import { getSectionInfo } from "thunks/sections/getters";
import { maybeIncrementProjectStateVersion } from "../undo";
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
  updateCurrChildren(sectionId);
  maybeIncrementProjectStateVersion(incrementVersion);
}
