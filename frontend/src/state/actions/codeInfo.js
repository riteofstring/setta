import _ from "lodash";
import { useCodeInfo, useCodeInfoCols } from "state/definitions";
import { getSectionCodeInfoChildren } from "./codeInfoCols";
import {
  getSectionCodeInfoColId,
  getSectionSelectedItem,
} from "./sectionVariants";

export function setAllCodeInfo(x) {
  useCodeInfo.setState({ x });
}

export function addCodeInfo({ sectionId, info, parent, insertIdx }) {
  useCodeInfo.setState((state) => {
    state.x[info.id] = info;
  });

  useCodeInfoCols.setState((state) => {
    const codeInfoColId = getSectionCodeInfoColId(sectionId);
    if (_.isNil(insertIdx)) {
      state.x[codeInfoColId]["children"][parent].push(info.id);
    } else {
      state.x[codeInfoColId]["children"][parent].splice(insertIdx, 0, info.id);
    }
    state.x[codeInfoColId]["children"][info.id] = [];
  });
}

export function setCodeInfoName({ id, name }) {
  useCodeInfo.setState((state) => {
    state.x[id].name = name;
  });
}

export function setCodeInfoKeywordPositions({ id, keywordPositions }) {
  useCodeInfo.setState((state) => {
    state.x[id].keywordPositions = keywordPositions;
  });
}

export function setCodeInfoDescription({ id, description }) {
  useCodeInfo.setState((state) => {
    state.x[id].description = description;
  });
}

export function setCodeInfoFrozen({ ids, isFrozen }) {
  useCodeInfo.setState((state) => {
    for (const id of ids) {
      state.x[id].isFrozen = isFrozen;
    }
  });
}

export function deleteCodeInfo({ ids }) {
  useCodeInfo.setState((state) => {
    state.x = _.omit(state.x, ids);
  });
  useCodeInfoCols.setState((state) => {
    state.x = _.omit(state.x, ids);
    for (const codeCol of Object.values(state.x)) {
      for (const parentId of Object.keys(codeCol.children)) {
        codeCol.children[parentId] = codeCol.children[parentId].filter(
          (y) => !ids.includes(y),
        );
      }
    }
  });
}

export function addCodeInfoBatch(x) {
  useCodeInfo.setState((state) => {
    state.x = { ...state.x, ...x };
  });
}

export function batchUpdateCodeInfoAttrs(idToNewAttrs) {
  useCodeInfo.setState((state) => {
    for (const [id, newAttrs] of Object.entries(idToNewAttrs)) {
      for (const [k, v] of Object.entries(newAttrs)) {
        state.x[id][k] = v;
      }
    }
  });
}

export function itemHasBeenSelectedBefore(sectionId, selectedItemName) {
  // empty value is equivalent to the "null" callable id
  if (selectedItemName === "") {
    return null;
  }

  const codeInfoChildren = getSectionCodeInfoChildren(sectionId);
  const cState = useCodeInfo.getState().x;
  for (const c of codeInfoChildren[null]) {
    if (cState[c].name === selectedItemName) {
      return c;
    }
  }
  return undefined;
}

export function itemIsAlreadySelected(sectionId, selectedItemName) {
  const currSelectedItem = getSectionSelectedItem(sectionId);
  return useCodeInfo.getState().x[currSelectedItem]?.name === selectedItemName;
}

export function setSelectedItemKeywordPositions(sectionId, keywordPositions) {
  const currSelectedItem = getSectionSelectedItem(sectionId);
  setCodeInfoKeywordPositions({ id: currSelectedItem, keywordPositions });
}
