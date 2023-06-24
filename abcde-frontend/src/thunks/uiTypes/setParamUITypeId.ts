import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo, setSectionInfoAttr } from "thunks/sections/sections";
import { requiresNestedSection } from "utils/constants";
import { initializeChild } from "../initializeParam";
import { getParamEVId } from "../paramInfos";
import { maybeIncrementProjectStateVersion } from "../undo";

export function setParamUITypeId({
  uiTypeId,
  sectionId,
  paramInfoId,
  incrementVersion = false,
}) {
  const { uiTypeColId } = getSectionInfo(sectionId);

  useParamInfos.getState().setUITypeId({
    collectionId: uiTypeColId,
    paramInfoId,
    uiTypeId,
  });

  const isNested = requiresNestedSection(
    useUITypes.getState().x[uiTypeId].type
  );

  if (isNested) {
    const paramInfo = useCodeInfo.getState().allCodeInfo[paramInfoId];
    const evId = getParamEVId(sectionId, paramInfoId);
    const { paramIdToChildId } = initializeChild(
      sectionId,
      { [paramInfoId]: paramInfo },
      { [paramInfoId]: uiTypeId },
      { [paramInfoId]: evId }
    );

    setSectionInfoAttr({
      sectionId: paramIdToChildId[paramInfoId],
      attr: "uiTypeId",
      value: uiTypeId,
    });
  }

  maybeIncrementProjectStateVersion(incrementVersion);
}
