import _ from "lodash";
import { useCodeInfo } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { getSectionSelectedItem } from "./sectionVariants";

export function setAllCodeInfo(x) {
  useCodeInfo.setState({ x });
}

export function addCodeInfo({ info, parent, insertIdx }) {
  useCodeInfo.setState((state) => {
    state.x[info.id] = info;
    if (parent) {
      if (_.isNil(insertIdx)) {
        state.x[parent].children.push(info.id);
      } else {
        state.x[parent].children.splice(insertIdx, 0, info.id);
      }
    }
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
    for (const c of Object.values(state.x)) {
      c.children = c.children.filter((y) => !ids.includes(y));
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

export function batchUpdateCodeInfoChildren(idToNewChildren) {
  useCodeInfo.setState((state) => {
    for (const [id, newChildren] of Object.entries(idToNewChildren)) {
      state.x[id].children = newChildren;
    }
  });
}

export function itemHasBeenSelectedBefore(sectionId, selectedItemName) {
  const { codeInfoId } = getSectionInfo(sectionId);
  const cState = useCodeInfo.getState().x;
  for (const c of cState[codeInfoId].children) {
    if (cState[c].name === selectedItemName) {
      return c;
    }
  }
  return null;
}

export function itemIsAlreadySelected(sectionId, selectedItemName) {
  const currSelectedItem = getSectionSelectedItem(sectionId);
  return useCodeInfo.getState().x[currSelectedItem]?.name === selectedItemName;
}

export function setSelectedItemKeywordPositions(sectionId, keywordPositions) {
  const currSelectedItem = getSectionSelectedItem(sectionId);
  setCodeInfoKeywordPositions({ id: currSelectedItem, keywordPositions });
}
