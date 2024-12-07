import _ from "lodash";
import { createNewId } from "utils/idNameCreation";
import { newCodeInfoCol } from "utils/objs/codeInfoCol";
import { getSectionVariant } from "./sectionInfos";

export function addCodeInfo({ sectionId, info, parent, insertIdx, state }) {
  state.codeInfo[info.id] = info;
  const variant = getSectionVariant(sectionId, state);
  let codeInfoColId = variant.codeInfoColId;
  if (!codeInfoColId) {
    codeInfoColId = createNewId();
    variant.codeInfoColId = codeInfoColId;
    state.codeInfoCols[codeInfoColId] = newCodeInfoCol();
  }

  const currCodeInfoCol = state.codeInfoCols[codeInfoColId];
  if (!(parent in currCodeInfoCol.children)) {
    currCodeInfoCol.children[parent] = [];
  }

  if (_.isNil(insertIdx)) {
    currCodeInfoCol.children[parent].push(info.id);
  } else {
    currCodeInfoCol.children[parent].splice(insertIdx, 0, info.id);
  }
  currCodeInfoCol.children[info.id] = [];
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
