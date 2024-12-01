import _ from "lodash";

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

export function deleteCodeInfo(sectionId, ids, state) {
  const { uiTypeColId, variantId } = state.x[sectionId];

  state.codeInfo = _.omit(state.codeInfo, ids);
  state.codeInfoCols = _.omit(state.codeInfoCols, ids);
  for (const codeCol of Object.values(state.codeInfoCols)) {
    for (const parentId of Object.keys(codeCol.children)) {
      codeCol.children[parentId] = codeCol.children[parentId].filter(
        (y) => !ids.includes(y),
      );
    }
  }
  state.variants[variantId].values = _.omit(
    state.variants[variantId].values,
    ids,
  );

  state.uiTypeCols[uiTypeColId] = _.omit(state.uiTypeCols[uiTypeColId], ids);

  for (const s of state.variants[variantId].sweep) {
    s.params = s.params.filter((y) => !ids.includes(y.paramInfoId));
  }
}
