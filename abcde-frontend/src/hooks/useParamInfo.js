import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import { curryAction } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";

import { useGetSectionTypeConfig } from "./useSectionType";

function useParamInfoState(collectionId, stateName, setStateFn, key, attr) {
  return (paramInfoId) => {
    const setX = curryAction(
      useStoreActions((x) => x.paramInfos[setStateFn]),
      { collectionId }
    );
    const x = useStoreState(
      (x) => x.paramInfos[attr][collectionId]?.[paramInfoId]
    );
    const setX_ = curryAction(setX, { paramInfoId }, key);
    return [x, setX_];
  };
}

function useParamWithParamCollectionId(sectionId, stateName, setStateFn, key) {
  const { paramCollectionId } = useGetSectionConfig(sectionId);
  return useParamInfoState(paramCollectionId, stateName, setStateFn, key, "x");
}

function useParamWithUITypeColId(sectionId, stateName, setStateFn, key) {
  const { uiTypeColId } = useGetSectionTypeConfig(sectionId);
  return useParamInfoState(uiTypeColId, stateName, setStateFn, key, "y");
}

export function useParamEnteredValueId(sectionId) {
  return useParamWithParamCollectionId(
    sectionId,
    "enteredValueId",
    "setEnteredValueId",
    "enteredValueId"
  );
}

export function useGetParamChildId(sectionId, paramInfoId) {
  return useStoreState((x) => x.paramInfos.childId(sectionId, paramInfoId));
}

export function useParamUITypeId(sectionId) {
  return useParamWithUITypeColId(
    sectionId,
    "uiTypeId",
    "setUITypeId",
    "uiTypeId"
  );
}

export function useGetManyParamsWithParamCollectionId(
  sectionId,
  paramInfos,
  key
) {
  const { paramCollectionId } = useGetSectionConfig(sectionId);
  const enteredValueIds = useStoreState(
    (x) => paramInfos.map((y) => x.paramInfos.x[paramCollectionId]?.[y.id]),
    _.isEqual
  );
  return useStoreState(
    (x) => enteredValueIds.map((y) => x.enteredValues.x[y]?.[key]),
    _.isEqual
  );
}

export function useGetManyParamsWithUITypeColId(sectionId, paramInfos) {
  const { uiTypeColId } = useGetSectionTypeConfig(sectionId);
  return useStoreState(
    (x) => paramInfos.map((y) => x.paramInfos.y[uiTypeColId]?.[y.id]),
    _.isEqual
  );
}
