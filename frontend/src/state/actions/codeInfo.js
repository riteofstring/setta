import _ from "lodash";
import { useCodeInfo } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";

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

export function setCodeInfoDescription({ id, description }) {
  useCodeInfo.setState((state) => {
    state.x[id].description = description;
  });
}

export function toggleCodeInfoPinned(id) {
  useCodeInfo.setState((state) => {
    state.x[id].isPinned = !state.x[id].isPinned;
  });
}

export function toggleCodeInfoSelected(id) {
  useCodeInfo.setState((state) => {
    state.x[id].isSelected = !state.x[id].isSelected;
  });
}

export function setCodeInfoFrozen({ ids, isFrozen }) {
  useCodeInfo.setState((state) => {
    for (const id of ids) {
      state.x[id].isFrozen = isFrozen;
    }
  });
}

export function deleteCodeInfo({ ids, parent }) {
  useCodeInfo.setState((state) => {
    state.x = _.omit(state.x, ids);
    if (parent) {
      state.x[parent].children = state.x[parent].children.filter(
        (y) => !ids.includes(y),
      );
    }
  });
}

export function addCodeInfoBatch(x) {
  useCodeInfo.setState((state) => {
    state.x = { ...state.x, ...x };
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
      return true;
    }
  }
  return false;
}
