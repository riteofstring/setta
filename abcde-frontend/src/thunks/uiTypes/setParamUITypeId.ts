import { requiresNestedSection } from "abcde-utils/src/constants";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo } from "thunks/sections/getters";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { initializeChild } from "../initializeParam";
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

  const isNested = requiresNestedSection(
    useUITypes.getState().x[uiTypeId].type
  );

  if (isNested) {
    const paramInfo = useCodeInfo.getState().x[paramInfoId];
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

  convertValue({ sectionId, paramInfoId, uiTypeId });
  maybeIncrementProjectStateVersion(incrementVersion);
}
