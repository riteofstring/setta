import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo, setSectionInfoAttr } from "thunks/sections/sections";
import { requiresNestedSection } from "utils/constants";
import { initializeChild } from "../initializeParam";
import { maybeIncrementProjectStateVersion } from "../undo";

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

  const isNested = requiresNestedSection(
    useUITypes.getState().x[uiTypeId].type
  );

  if (isNested) {
    const paramInfo = useCodeInfo.getState().allCodeInfo[paramInfoId];
    const { paramIdToChildId } = initializeChild(
      sectionId,
      { [paramInfoId]: paramInfo },
      { [paramInfoId]: uiTypeId }
    );

    setSectionInfoAttr({
      sectionId: paramIdToChildId[paramInfoId],
      attr: "uiTypeId",
      value: uiTypeId,
    });
  }

  maybeIncrementProjectStateVersion(incrementVersion);
}
