import C from "constants/constants.json";
import {
  dbParametersRequest,
  getKeywordPositionsAndEVRefs,
} from "requests/sections";
import { initializeChildParams } from "state/actions/initializeParam";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { newCodeInfo } from "utils/objs/codeInfo";
import {
  addCodeInfo,
  itemHasBeenSelectedBefore,
  itemIsAlreadySelected,
  setCodeInfoDescription,
} from "../codeInfo";
import { setParametersRequestWaitingForLSP } from "../lsp";
import { setNotificationMessage } from "../notification";
import { setSectionInfoAttr } from "./sectionInfos";

export async function setSelectedItem(
  dataSectionId,
  visualSectionId,
  selectedItemName,
  changedByUser,
  callbackSetAttr,
) {
  if (itemIsAlreadySelected(dataSectionId, selectedItemName)) {
    callbackSetAttr(undefined);
    return;
  }

  const prevSelected = itemHasBeenSelectedBefore(
    dataSectionId,
    selectedItemName,
  );
  if (prevSelected !== undefined) {
    callbackSetAttr(prevSelected);
    maybeIncrementProjectStateVersion(changedByUser);
  } else {
    const { id, evRefs } = await createNewCodeInfoAndKeywordPositions({
      sectionId: dataSectionId,
      selectedItemName,
    });
    callbackSetAttr(id);
    await createCodeInfoChildren({
      dataSectionId,
      visualSectionId,
      selectedItemName,
      evRefs,
      codeInfoId: id,
      changedByUser,
    });
  }
}

function createChildrenCodeInfo(sectionId, parent, params) {
  for (const p of params) {
    const info = newCodeInfo({
      name: p.name,
      editable: false,
      rcType: C.PARAMETER,
      defaultVal: p.defaultVal,
      description: p.description,
      positionalOnly: p.positionalOnly,
    });
    addCodeInfo({ sectionId, info, parent });
  }
}

function setSelectedItemChildren(sectionId, selectedItem, incrementVersion) {
  initializeChildParams({
    sectionIds: [sectionId],
    codeInfoIds: [selectedItem],
  });
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
  addCodeInfo({ sectionId, info, parent: null });
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

  const res = await dbParametersRequest({
    sectionId: dataSectionId,
    fullText: selectedItemName,
    beforeText: "",
    position: selectedItemName.length,
    evRefs,
  });
  if (res) {
    const [documentation, params] = res;
    if (params) {
      createChildrenCodeInfo(dataSectionId, codeInfoId, params);
      setSelectedItemChildren(dataSectionId, codeInfoId, changedByUser);
    } else {
      setNotificationMessage("No parameters found");
    }
    setCodeInfoDescription({ id: codeInfoId, description: documentation });
  } else {
    setNotificationMessage("No parameters found");
  }
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
