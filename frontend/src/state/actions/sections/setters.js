import C from "constants/constants.json";
import { dbParametersRequest } from "requests/sections";
import { initializeChildParams } from "state/actions/initializeParam";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { varControlUpdate } from "state/actions/varControl";
import { newCodeInfo } from "utils/objs/codeInfo";
import { getParamSweepSectionName } from "utils/sectionTypeHelpers";
import { getSectionInfo } from "../../getters/sectionInfo";
import {
  addCodeInfo,
  itemHasBeenSelectedBefore,
  itemIsAlreadySelected,
} from "../codeInfo";
import { updateKeywordRegex } from "../keywordRegex";
import { setSectionVariantSelectedItem } from "../sectionVariants";
import { updateCallables, updateParams } from "./sectionContents";
import { setSectionInfoAttr } from "./sectionInfos";
import { setNotificationMessage } from "../notification";

export async function setSelectedItem(sectionId, selectedItem, changedByUser) {
  if (itemIsAlreadySelected(sectionId, selectedItem)) {
    return;
  }

  const prevSelected = itemHasBeenSelectedBefore(sectionId, selectedItem);
  if (prevSelected) {
    setSectionVariantSelectedItem(sectionId, prevSelected);
    updateParams(sectionId);
    maybeIncrementProjectStateVersion(changedByUser);
  } else {
    const info = newCodeInfo({
      name: selectedItem,
      editable: false,
      rcType: C.CALLABLE,
    });
    const { codeInfoId } = getSectionInfo(sectionId);
    addCodeInfo({ info, parent: codeInfoId });
    updateCallables(sectionId);

    const id = info.id;
    setSectionVariantSelectedItem(sectionId, id);

    const res = await dbParametersRequest({
      sectionId,
      fullText: selectedItem,
      beforeText: "",
      position: selectedItem.length,
    });
    if (res) {
      createChildrenCodeInfo(id, res);
      setSelectedItemChildren(sectionId, id, changedByUser);
      updateKeywordRegex();
    } else{
      setNotificationMessage("No parameters found")
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

export function setSectionParentId(sectionId, parentId) {
  setSectionInfoAttr({ sectionId, attr: "parentId", value: parentId });
}

export function setSectionSize(sectionId, size) {
  setSectionInfoAttr({ sectionId, attr: "size", value: size });
}
