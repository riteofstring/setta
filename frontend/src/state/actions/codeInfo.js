import _ from "lodash";
import { useSectionInfos } from "state/definitions";

export function addCodeInfo({ sectionId, info, parent, insertIdx, state }) {
  state.codeInfo[info.id] = info;
  const { codeInfoColId } = state.variants[state.x[sectionId].variantId];
  if (_.isNil(insertIdx)) {
    state.codeInfoCols[codeInfoColId].children[parent].push(info.id);
  } else {
    state.codeInfoCols[codeInfoColId].children[parent].splice(
      insertIdx,
      0,
      info.id,
    );
  }
  state.codeInfoCols[codeInfoColId].children[info.id] = [];
}

export function setCodeInfoName({ id, name }) {
  useSectionInfos.setState((state) => {
    state.codeInfo[id].name = name;
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
