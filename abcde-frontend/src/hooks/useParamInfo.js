import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import { curryAction } from "utils/utils";

import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionTypeConfig } from "./useSectionType";

function useParamInfoState(collectionId, stateName, setStateFn, key, attr) {
  return (paramInfoId) => {
    const setX = curryAction(
      useStoreActions((x) => x.paramInfos[setStateFn]),
      { collectionId }
    );
    const x = useStoreState(
      (x) => x.paramInfos[attr][collectionId]?.[paramInfoId]?.[stateName]
    );
    const setX_ = curryAction(setX, { paramInfoId }, key);
    return [x, setX_];
  };
}

function useParamWithParamCollectionId(sectionId, stateName, setStateFn, key) {
  const { paramCollectionId } = useGetSectionInfo(sectionId);
  return useParamInfoState(paramCollectionId, stateName, setStateFn, key, "x");
}

function useParamWithUITypeCollectionId(sectionId, stateName, setStateFn, key) {
  const { uiTypeCollectionId } = useGetSectionTypeConfig(sectionId);
  return useParamInfoState(uiTypeCollectionId, stateName, setStateFn, key, "y");
}

export function useParamEnteredValueId(sectionId) {
  return useParamWithParamCollectionId(
    sectionId,
    "enteredValueId",
    "setEnteredValueId",
    "enteredValueId"
  );
}

export function useParamChildId(sectionId) {
  return useParamWithParamCollectionId(
    sectionId,
    "childId",
    "setChildId",
    "childId"
  );
}

export function useParamUITypeId(sectionId) {
  return useParamWithUITypeCollectionId(
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
  const { paramCollectionId } = useGetSectionInfo(sectionId);
  return useStoreState(
    (x) =>
      paramInfos.map((y) => x.paramInfos.x[paramCollectionId]?.[y.id]?.[key]),
    _.isEqual
  );
}

export function useGetManyParamsWithUITypeCollectionId(
  sectionId,
  paramInfos,
  key
) {
  const { uiTypeCollectionId } = useGetSectionTypeConfig(sectionId);
  return useStoreState(
    (x) =>
      paramInfos.map((y) => x.paramInfos.y[uiTypeCollectionId]?.[y.id]?.[key]),
    _.isEqual
  );
}
