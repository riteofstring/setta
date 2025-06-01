import _ from "lodash";
import { createCodeInfoCol } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { getSectionVariant } from "./sectionInfos";

export function addCodeInfo({ sectionId, info, parent, insertIdx, state }) {
  state.codeInfo[info.id] = info;
  const variant = getSectionVariant(sectionId, state);
  const currCodeInfoCol = getOrCreateCodeInfoCol(variant, state);
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
  const variant = getSectionVariant(sectionId, state);
  const codeInfoCol = getOrCreateCodeInfoCol(variant, state);
  for (const parentId of Object.keys(codeInfoCol.children)) {
    codeInfoCol.children[parentId] = codeInfoCol.children[parentId].filter(
      (y) => !ids.includes(y),
    );
  }

  codeInfoCol.children = _.omit(codeInfoCol.children, ids);

  const { variantId, uiTypeColId } = state.sections[sectionId];
  state.variants[variantId].values = _.omit(
    state.variants[variantId].values,
    ids,
  );
  state.uiTypeCols[uiTypeColId] = _.omit(state.uiTypeCols[uiTypeColId], ids);
}

export function getOrCreateCodeInfoCol(variant, state) {
  let codeInfoColId = variant.codeInfoColId;
  if (!codeInfoColId) {
    codeInfoColId = createNewId();
    variant.codeInfoColId = codeInfoColId;
    state.codeInfoCols[codeInfoColId] = createCodeInfoCol();
  }

  return state.codeInfoCols[codeInfoColId];
}

export function newCodeInfoMaybeWithJsonSource(props, sectionId, state) {
  return createCodeInfo({
    ...props,
    jsonSource: state.sections[sectionId].jsonSource,
  });
}
