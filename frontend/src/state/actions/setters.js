import C from "constants/constants.json";
import _ from "lodash";
import { dbParametersRequest } from "requests/sections";
import { initializeChildParams } from "state/actions/initializeParam";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { varControlUpdate } from "state/actions/varControl";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { isUUID } from "utils/idNameCreation";
import { newCodeInfo } from "utils/objs/codeInfo";
import { getParamSweepSectionName } from "utils/sectionTypeHelpers";
import { getSectionInfo, getSectionTypeConfig } from "../getters/sectionInfo";
import { addCodeInfo } from "./codeInfo";
import { updateKeywordRegex } from "./keywordRegex";
import { updateCallables, updateParams } from "./sectionContents";
import { setSectionInfoAttr } from "./sectionInfos";

export async function setSelectedItem(sectionId, selectedItem, changedByUser) {
  let id = selectedItem;
  if (!isUUID(id)) {
    const info = newCodeInfo({
      name: selectedItem,
      editable: false,
      rcType: C.CALLABLE,
    });
    const { codeInfoId } = getSectionTypeConfig(sectionId);
    addCodeInfo({ info, parent: codeInfoId });
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
    createChildrenCodeInfo(id, res);
    setSelectedItemChildren(sectionId, id, changedByUser);
  }
  updateKeywordRegex(_.mapValues(useSectionInfos.getState().x, (x) => x.name));
}

function createChildrenCodeInfo(parent, params) {
  for (const p of params) {
    const info = newCodeInfo({
      name: p.name,
      editable: false,
      rcType: C.PARAMETER,
      defaultVal: p.defaultVal,
      description: p.description,
      positionalOnly: p.positionalOnly,
    });
    addCodeInfo({ info, parent });
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
