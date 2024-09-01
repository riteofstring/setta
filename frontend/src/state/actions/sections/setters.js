import C from "constants/constants.json";
import {
  dbParametersRequest,
  getKeywordPositionsAndEVRefs,
} from "requests/sections";
import { initializeChildParams } from "state/actions/initializeParam";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { newCodeInfo } from "utils/objs/codeInfo";
import { getParamSweepSectionName } from "utils/sectionTypeHelpers";
import { getSectionInfo } from "../../getters/sectionInfo";
import {
  addCodeInfo,
  itemHasBeenSelectedBefore,
  itemIsAlreadySelected,
} from "../codeInfo";
import { updateKeywordRegex } from "../keywordRegex";
import { setParametersRequestWaitingForLSP } from "../lsp";
import { setNotificationMessage } from "../notification";
import { setSectionVariantAttr } from "../sectionVariants";
import { setSectionInfoAttr } from "./sectionInfos";

export async function setSelectedItem(
  sectionId,
  selectedItemName,
  changedByUser,
) {
  if (itemIsAlreadySelected(sectionId, selectedItemName)) {
    return;
  }

  const prevSelected = itemHasBeenSelectedBefore(sectionId, selectedItemName);
  if (prevSelected) {
    setSectionVariantAttr(sectionId, "selectedItem", prevSelected);
    maybeIncrementProjectStateVersion(changedByUser);
  } else {
    const { evRefs, keywordPositions } = await getKeywordPositionsAndEVRefs({
      sectionId,
      paramInfoId: null,
      fullText: selectedItemName,
    });
    const info = newCodeInfo({
      name: selectedItemName,
      editable: false,
      rcType: C.CALLABLE,
      keywordPositions,
    });
    const { codeInfoId } = getSectionInfo(sectionId);
    addCodeInfo({ info, parent: codeInfoId });

    const id = info.id;
    setSectionVariantAttr(sectionId, "selectedItem", id);

    const setToNotWaiting = setParametersRequestWaitingForLSP(sectionId);

    const res = await dbParametersRequest({
      sectionId,
      fullText: selectedItemName,
      beforeText: "",
      position: selectedItemName.length,
      evRefs,
    });
    if (res) {
      createChildrenCodeInfo(id, res);
      setSelectedItemChildren(sectionId, id, changedByUser);
      updateKeywordRegex();
    } else {
      setNotificationMessage("No parameters found");
    }
    setToNotWaiting();
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
