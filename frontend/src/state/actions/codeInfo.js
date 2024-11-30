import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { getSectionCodeInfoChildren } from "./codeInfoCols";
import { getSectionSelectedItem } from "./sectionVariants";

export function addCodeInfo({ sectionId, info, parent, insertIdx }) {
  useSectionInfos.setState((x) => {
    x.codeInfo[info.id] = info;
    const { codeInfoColId } = x.variants[x.x[sectionId].variantId];
    if (_.isNil(insertIdx)) {
      x.codeInfoCols[codeInfoColId].children[parent].push(info.id);
    } else {
      x.codeInfoCols[codeInfoColId].children[parent].splice(
        insertIdx,
        0,
        info.id,
      );
    }
    x.codeInfoCols[codeInfoColId].children[info.id] = [];
  });
}

export function setCodeInfoName({ id, name }) {
  useSectionInfos.setState((state) => {
    state.codeInfo[id].name = name;
  });
}

export function setCodeInfoDescription({ id, description }) {
  useSectionInfos.setState((state) => {
    state.codeInfo[id].description = description;
  });
}

export function deleteCodeInfo({ ids }) {
  useSectionInfos.setState((state) => {
    state.codeInfo = _.omit(state.codeInfo, ids);
    state.codeInfoCols = _.omit(state.codeInfoCols, ids);
    for (const codeCol of Object.values(state.codeInfoCols)) {
      for (const parentId of Object.keys(codeCol.children)) {
        codeCol.children[parentId] = codeCol.children[parentId].filter(
          (y) => !ids.includes(y),
        );
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
  const cState = useSectionInfos.getState().codeInfo;
  for (const c of codeInfoChildren[null]) {
    if (cState[c].name === selectedItemName) {
      return c;
    }
  }
  return undefined;
}

export function itemIsAlreadySelected(sectionId, selectedItemName) {
  const currSelectedItem = getSectionSelectedItem(sectionId);
  return (
    useSectionInfos.getState().codeInfo[currSelectedItem]?.name ===
    selectedItemName
  );
}
