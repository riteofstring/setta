import _ from "lodash";
import { useSectionVariants, useUITypes } from "state/definitions";
import { createRandomName } from "utils/idNameCreation";
import { getValueForUIType, newEV } from "utils/objs/ev";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "../getters/sectionInfo";
import { initValue } from "../utils";
import { debouncedRequestTypeCheck } from "./typeCheck";
import { maybeIncrementProjectStateVersion } from "./undo";
import { varControlUpdate } from "./varControl";

export function setAllSectionVariants(x) {
  useSectionVariants.setState({ x });
}

export function duplicateSectionVariant({ dbSource, id, newId, newName }) {
  useSectionVariants.setState((state) => {
    const dbSlice = state.x[dbSource];
    dbSlice[newId] = _.cloneDeep(dbSlice[id]);
    dbSlice[newId].name = newName;
  });
}
export function duplicateDbSource({ oldDbSource, newDbSource }) {
  useSectionVariants.setState((state) => {
    if (!(newDbSource in state.x)) {
      return;
    }
    const oldDb = state.x[oldDbSource];
    const newDb = state.x[newDbSource];
    for (const evColId of Object.keys(oldDb)) {
      if (!(evColId in newDb)) {
        newDb[evColId] = _.cloneDeep(oldDb[evColId]);
      }
    }
  });
}
export function initManySectionVariantIds({ dbSource, collectionIds }) {
  useSectionVariants.setState((state) => {
    _.forEach(collectionIds, (id) => {
      initValue(state.x, dbSource, {});
      initValue(state.x[dbSource], id, {
        name: createRandomName(),
        values: {},
        children: [],
      });
    });
  });
}
export function initManyEnteredValues({
  dbSource,
  collectionId,
  paramIdsToUITypes,
}) {
  useSectionVariants.setState((state) => {
    _.forEach(paramIdsToUITypes, (uiType, id) => {
      state.x[dbSource][collectionId].values[id] = newEV(uiType);
    });
  });
}
export function setEnteredValue({
  dbSource,
  collectionId,
  paramInfoId,
  value,
}) {
  useSectionVariants.setState((state) => {
    state.x[dbSource][collectionId].values[paramInfoId] = value;
  });
}
export function deleteParamInfoFromSectionVariant({ dbSource, evColId, ids }) {
  useSectionVariants.setState((state) => {
    state.x[dbSource][evColId].values = _.omit(
      state.x[dbSource][evColId].values,
      ids,
    );
  });
}
export function updateSectionVariants({ sectionVariants }) {
  useSectionVariants.setState((state) => {
    state.x = { ...state.x, ...sectionVariants };
  });
}

export function convertValue({ sectionId, paramInfoId, uiTypeId }) {
  const uiType = useUITypes.getState().x[uiTypeId];
  const currValue = getParamEV(sectionId, paramInfoId);
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue({ sectionId, paramInfoId, value });
}

function getParamEV(sectionId, paramInfoId) {
  const { evColId } = getSectionInfo(sectionId);
  const dbSource = getMappedSectionDBSource(sectionId);
  return useSectionVariants.getState().x[dbSource][evColId].values[paramInfoId];
}
export function setParamEnteredValue({
  sectionId,
  paramInfoId,
  value,
  incrementVersion = false,
}) {
  const { evColId } = getSectionInfo(sectionId);
  const dbSource = getMappedSectionDBSource(sectionId);
  setEnteredValue({ dbSource, collectionId: evColId, paramInfoId, value });
  if (incrementVersion) {
    varControlUpdate();
  }
  maybeIncrementProjectStateVersion(incrementVersion);
  debouncedRequestTypeCheck();
}
