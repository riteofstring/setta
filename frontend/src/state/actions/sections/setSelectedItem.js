import C from "constants/constants.json";
import { dbParametersRequest, getEVRefs } from "requests/sections";
import { useSectionInfos } from "state/definitions";
import { newCodeInfo } from "utils/objs/codeInfo";
import { addCodeInfo } from "../codeInfo";
import { setParametersRequestWaitingForLSP } from "../lsp";
import { setNotificationMessage } from "../notification";
import { getCodeInfoCol, getSectionVariant } from "../sectionInfos";
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

  const evRefs = await getEVRefs({
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
      evRefs,
    });
    addCodeInfo({ sectionId: dataSectionId, info, parent: null, state });

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
    addCodeInfo({ sectionId, info, parent, state });
    paramIds.push(info.id);
  }
}

function itemHasBeenSelectedBefore(sectionId, selectedItemName) {
  // empty value is equivalent to the "null" callable id
  if (selectedItemName === "") {
    return null;
  }
  const state = useSectionInfos.getState();
  const codeInfoChildren = getCodeInfoCol(sectionId, state).children;
  for (const c of codeInfoChildren[null]) {
    if (state.codeInfo[c].name === selectedItemName) {
      return c;
    }
  }
  return undefined;
}

function itemIsAlreadySelected(sectionId, selectedItemName) {
  const state = useSectionInfos.getState();
  const currSelectedItem = getSectionVariant(sectionId, state).selectedItem;
  return state.codeInfo[currSelectedItem]?.name === selectedItemName;
}
