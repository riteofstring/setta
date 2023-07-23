import { USER_SPECIFIED_OBJECT_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newCodeInfo } from "abcde-utils/src/objs/codeInfo";
import { RCType } from "abcde-utils/src/types/codeInfo";
import { useCodeInfo } from "models/info/codeInfo";
import { getSectionInfo } from "thunks/sections/getters";
import { setSectionInfoAttr, setSelectedItem } from "thunks/sections/setters";
import { maybeIncrementProjectStateVersion } from "../undo";
import { setParamUITypeId } from "./setParamUITypeId";

export function setSectionUITypeId({
  uiTypeId,
  sectionId,
  incrementVersion = false,
}) {
  const { parentId, paramInfoId } = getSectionInfo(sectionId);

  setSectionInfoAttr({
    sectionId,
    attr: "uiTypeId",
    value: uiTypeId,
  });

  if (paramInfoId) {
    setParamUITypeId({ sectionId: parentId, paramInfoId, uiTypeId });
  }

  if (uiTypeId === USER_SPECIFIED_OBJECT_UI_TYPE_ID) {
    initializeUserSpecifiedObject(sectionId);
  }

  maybeIncrementProjectStateVersion(incrementVersion);
}

function initializeUserSpecifiedObject(sectionId) {
  let { userSpecifiedObjectId } = getSectionInfo(sectionId);
  if (!userSpecifiedObjectId) {
    const newObj = newCodeInfo({
      rcType: RCType.CALLABLE,
    });
    userSpecifiedObjectId = newObj.id;
    setSectionInfoAttr({
      sectionId,
      attr: "userSpecifiedObjectId",
      value: userSpecifiedObjectId,
    });
    useCodeInfo
      .getState()
      .updateInfos({ allCodeInfo: { [newObj.id]: newObj } });
  }
  setSelectedItem(sectionId, userSpecifiedObjectId, false);
}
