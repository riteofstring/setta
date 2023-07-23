import { useSectionInfos } from "models/info/sectionInfos";
import { initializeChildParams } from "thunks/initializeParam";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { updateCurrChildren } from "./children";
import { updateParamsAndCallables } from "./sectionContents";

export function setSelectedItem(sectionId, selectedItem, changedByUser) {
  setSectionInfoAttr({
    sectionId,
    attr: "selectedItem",
    value: selectedItem,
  });
  initializeChildParams([sectionId], [selectedItem]);
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
