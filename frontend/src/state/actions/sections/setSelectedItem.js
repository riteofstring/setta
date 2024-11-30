import C from "constants/constants.json";
import {
  dbParametersRequest,
  getKeywordPositionsAndEVRefs,
} from "requests/sections";
import { _initializeParams } from "state/actions/initializeParam";
import { useSectionInfos } from "state/definitions";
import { newCodeInfo } from "utils/objs/codeInfo";
import { _addCodeInfo } from "../codeInfo";
import { setParametersRequestWaitingForLSP } from "../lsp";
import { setNotificationMessage } from "../notification";
import { maybeIncrementProjectStateVersion } from "../undo";

export async function setSelectedItem(
  dataSectionId,
  visualSectionId,
  selectedItemName,
  changedByUser,
  callbackSetAttr,
) {
  if (itemIsAlreadySelected(dataSectionId, selectedItemName)) {
    useSectionInfos.setState((state) => {
      callbackSetAttr(undefined, state);
    });
    return;
  }
  const prevSelected = itemHasBeenSelectedBefore(
    dataSectionId,
    selectedItemName,
  );

  if (prevSelected !== undefined) {
    useSectionInfos.setState((state) => {
      callbackSetAttr(prevSelected, state);
    });
    return;
  }

  const { evRefs, keywordPositions } = await getKeywordPositionsAndEVRefs({
    sectionId: dataSectionId,
    paramInfoId: null,
    fullText: selectedItemName,
  });

  const setToNotWaiting = setParametersRequestWaitingForLSP(visualSectionId);

  const paramRes = await dbParametersRequest({
    sectionId: dataSectionId,
    fullText: selectedItemName,
    beforeText: "",
    position: selectedItemName.length,
    evRefs,
  });

  useSectionInfos.setState((state) => {
    const info = newCodeInfo({
      name: selectedItemName,
      editable: false,
      rcType: C.CALLABLE,
      keywordPositions,
    });
    _addCodeInfo({ sectionId: dataSectionId, info, parent: null, state });

    if (paramRes) {
      const [documentation, params] = paramRes;
      if (params) {
        createChildrenCodeInfo(dataSectionId, info.id, params, state);
      } else {
        setNotificationMessage("No parameters found");
      }
      state.codeInfo[info.id].description = documentation;
    } else {
      setNotificationMessage("No parameters found");
    }
    setToNotWaiting();
    callbackSetAttr(info.id, state);
  });

  maybeIncrementProjectStateVersion(changedByUser);
}

function createChildrenCodeInfo(sectionId, parent, params, state) {
  const paramIds = [];
  for (const p of params) {
    const info = newCodeInfo({
      name: p.name,
      editable: false,
      rcType: C.PARAMETER,
      defaultVal: p.defaultVal,
      description: p.description,
      positionalOnly: p.positionalOnly,
    });
    _addCodeInfo({ sectionId, info, parent, state });
    paramIds.push(info.id);
  }
  _initializeParams(sectionId, paramIds, state);
}

function itemHasBeenSelectedBefore(sectionId, selectedItemName) {
  // empty value is equivalent to the "null" callable id
  if (selectedItemName === "") {
    return null;
  }
  const state = useSectionInfos.getState();

  const codeInfoChildren =
    state.codeInfoCols[
      state.variants[state.x[sectionId].variantId].codeInfoColId
    ].children;
  const cState = state.codeInfo;
  for (const c of codeInfoChildren[null]) {
    if (cState[c].name === selectedItemName) {
      return c;
    }
  }
  return undefined;
}

function itemIsAlreadySelected(sectionId, selectedItemName) {
  const state = useSectionInfos.getState();
  const currSelectedItem =
    state.variants[state.x[sectionId].variantId].selectedItem;
  return state.codeInfo[currSelectedItem]?.name === selectedItemName;
}
