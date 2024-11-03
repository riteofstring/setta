import C from "constants/constants.json";
import {
  dbParametersRequest,
  getKeywordPositionsAndEVRefs,
} from "requests/sections";
import { initializeChildParams } from "state/actions/initializeParam";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { newCodeInfo } from "utils/objs/codeInfo";
import { getParamSweepSectionName } from "utils/sectionTypeHelpers";
import { getSectionInfo } from "../../getters/sectionInfo";
import {
  addCodeInfo,
  itemHasBeenSelectedBefore,
  itemIsAlreadySelected,
  setCodeInfoDescription,
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
    const { id, evRefs } = await createNewCodeInfoAndKeywordPositions({
      sectionId,
      selectedItemName,
    });
    setSectionVariantAttr(sectionId, "selectedItem", id);
    await createCodeInfoChildren({
      dataSectionId: sectionId,
      visualSectionId: sectionId,
      selectedItemName,
      evRefs,
      codeInfoId: id,
      changedByUser,
    });
  }
  updateKeywordRegex();
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
  setSectionInfoAttr({
    sectionId,
    attr: "size",
    newValueFn: (currSize) => ({ ...currSize, ...size }),
  });
}

export async function createNewCodeInfoAndKeywordPositions({
  sectionId,
  selectedItemName,
}) {
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
  return { id: info.id, evRefs };
}

export async function createCodeInfoChildren({
  dataSectionId,
  visualSectionId,
  selectedItemName,
  evRefs,
  codeInfoId,
  changedByUser,
}) {
  const setToNotWaiting = setParametersRequestWaitingForLSP(visualSectionId);

  const [documentation, params] = await dbParametersRequest({
    sectionId: dataSectionId,
    fullText: selectedItemName,
    beforeText: "",
    position: selectedItemName.length,
    evRefs,
  });
  if (params) {
    createChildrenCodeInfo(codeInfoId, params);
    setSelectedItemChildren(dataSectionId, codeInfoId, changedByUser);
  } else {
    setNotificationMessage("No parameters found");
  }
  console.log("[documentation, params]", [documentation, params]);
  setCodeInfoDescription({ id: codeInfoId, description: documentation });
  setToNotWaiting();
}

export function setAspectRatioInfo({
  sectionId,
  aspectRatio,
  aspectRatioExtraHeight,
  aspectRatioExtraWidth,
}) {
  useSectionInfos.setState((x) => {
    const s = x.x[sectionId];
    s.aspectRatio = aspectRatio;
    s.aspectRatioExtraHeight = aspectRatioExtraHeight;
    s.aspectRatioExtraWidth = aspectRatioExtraWidth;
  });
}

export function setCanvasSettings(sectionId, attr, value) {
  useSectionInfos.setState((x) => {
    const s = x.x[sectionId];
    s.canvasSettings[attr] = value;
  });
}

export function setCanvasColorChoices(sectionId, value) {
  useSectionInfos.setState((x) => {
    const s = x.x[sectionId];
    s.canvasSettings.colorChoices = value;
  });
}
