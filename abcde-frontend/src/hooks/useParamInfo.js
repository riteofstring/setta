import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import { curryAction } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";

import { useGetSectionTypeConfig } from "./useSectionType";

function useParamInfoState(collectionId, setStateFn, key, attr) {
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

function useParamWithParamCollectionId(sectionId, setStateFn, key) {
  const { paramCollectionId } = useGetSectionConfig(sectionId);
  return useParamInfoState(paramCollectionId, setStateFn, key, "x");
}

function useParamWithUITypeColId(sectionId, setStateFn, key) {
  const { uiTypeColId } = useGetSectionTypeConfig(sectionId);
  return useParamInfoState(uiTypeColId, setStateFn, key, "y");
}

export function useParamEnteredValueId(sectionId) {
  return useParamWithParamCollectionId(
    sectionId,
    "setEnteredValueId",
    "enteredValueId"
  );
}

export function useGetParamChildId(sectionId, paramInfoId) {
  const { paramCollectionId } = useGetSectionConfig(sectionId);
  const enteredValueId = useStoreState(
    (x) => x.paramInfos.x[paramCollectionId]?.[paramInfoId]
  );
  return useStoreState((x) => x.enteredValues.x[enteredValueId]?.childId);
}

export function useParamUITypeId(sectionId) {
  return useParamWithUITypeColId(sectionId, "setUITypeId", "uiTypeId");
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
