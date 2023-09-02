import { newCodeInfo } from "abcde-utils/src/objs/codeInfo";
import { RCType } from "abcde-utils/src/types/codeInfo";
import { isUUID } from "abcde-utils/src/utils";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { initializeChildParams } from "thunks/initializeParam";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { updateCurrChildren } from "./children";
import { updateParamsAndCallables } from "./sectionContents";

export function setSelectedItem(sectionId, selectedItem, changedByUser) {
  let id = selectedItem;
  if (!isUUID(id)) {
    const info = newCodeInfo({
      name: selectedItem,
      editable: false,
      rcType: RCType.CALLABLE,
    });
    useCodeInfo.getState().addCodeInfo({ info });
    id = info.id;
  }

  setSectionInfoAttr({
    sectionId,
    attr: "selectedItem",
    value: id,
  });
  initializeChildParams([sectionId], [id]);
  updateParamsAndCallables(sectionId);
  updateCurrChildren(sectionId);
  maybeIncrementProjectStateVersion(changedByUser);
}

export function setSectionInfoAttr(props) {
  useSectionInfos.getState().setSectionInfoAttr(props);
}

export function setSectionName(sectionId, name, incrementVersion) {
  setSectionInfoAttr({ sectionId, attr: "name", value: name });
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setSectionSize(sectionId, size) {
  setSectionInfoAttr({ sectionId, attr: "size", value: size });
}

export function setSectionParamInfoId(sectionId, paramInfoId) {
  setSectionInfoAttr({ sectionId, attr: "paramInfoId", value: paramInfoId });
}

export function setSectionParentId(sectionId, parentId) {
  setSectionInfoAttr({ sectionId, attr: "parentId", value: parentId });
}
