import C from "constants/constants.json";
import { dbParametersRequest } from "dbRequests/sections";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { initializeChildParams } from "thunks/initializeParam";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { varControlUpdate } from "thunks/varControl";
import { getParamSweepSectionName } from "z_utils/constants";
import { newCodeInfo } from "z_utils/objs/codeInfo";
import { isUUID } from "z_utils/utils";
import { getSectionInfo, getSectionTypeConfig } from "./getters";
import { updateCallables, updateParams } from "./sectionContents";

export async function setSelectedItem(sectionId, selectedItem, changedByUser) {
  let id = selectedItem;
  if (!isUUID(id)) {
    const info = newCodeInfo({
      name: selectedItem,
      editable: false,
      rcType: C.CALLABLE,
    });
    const { codeInfoId } = getSectionTypeConfig(sectionId);
    useCodeInfo.getState().addCodeInfo({ info, parent: codeInfoId });
    id = info.id;
    updateCallables(sectionId);
  }

  setSectionInfoAttr({
    sectionId,
    attr: "selectedItem",
    value: id,
  });

  if (isUUID(selectedItem)) {
    setSelectedItemChildren(sectionId, id, changedByUser);
  } else {
    const res = await dbParametersRequest({
      sectionId,
      fullText: selectedItem,
      beforeText: "",
      position: selectedItem.length,
    });
    if (res.status === 200) {
      createChildrenCodeInfo(id, res.data);
      setSelectedItemChildren(sectionId, id, changedByUser);
    }
  }
}

function createChildrenCodeInfo(parent, params) {
  for (const p of params) {
    const info = newCodeInfo({
      name: p.name,
      editable: false,
      rcType: C.PARAMETER,
      defaultVal: p.defaultVal,
      description: p.description,
    });
    useCodeInfo.getState().addCodeInfo({ info, parent });
  }
}

function setSelectedItemChildren(sectionId, selectedItem, incrementVersion) {
  initializeChildParams({
    sectionIds: [sectionId],
    codeInfoIds: [selectedItem],
  });
  updateParams(sectionId);
  if (incrementVersion) {
    varControlUpdate();
  }
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setSectionInfoAttr(props) {
  useSectionInfos.getState().setSectionInfoAttr(props);
}

export function setSectionName(sectionId, name, incrementVersion) {
  setSectionInfoAttr({ sectionId, attr: "name", value: name });
  const paramSweepSectionId = getSectionInfo(sectionId).paramSweepSectionId;
  if (paramSweepSectionId) {
    setSectionInfoAttr({
      sectionId: paramSweepSectionId,
      attr: "name",
      value: getParamSweepSectionName(name),
    });
  }
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setSectionSize(sectionId, size) {
  setSectionInfoAttr({ sectionId, attr: "size", value: size });
}

export function setSectionParentId(sectionId, parentId) {
  setSectionInfoAttr({ sectionId, attr: "parentId", value: parentId });
}
