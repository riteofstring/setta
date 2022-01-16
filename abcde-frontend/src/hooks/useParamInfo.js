import { useStoreState, useStoreActions } from "easy-peasy";
import { curryAction } from "utils/utils";

import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";

export function useParamInfoState(
  collectionId,
  stateName,
  setStateFn,
  key,
  attr
) {
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

export function useParamWithParamCollectionId(
  sectionId,
  stateName,
  setStateFn,
  key
) {
  const { paramCollectionId } = useGetSectionInfo(sectionId);
  return useParamInfoState(paramCollectionId, stateName, setStateFn, key, "x");
}

export function useParamWithUITypeCollectionId(
  sectionId,
  stateName,
  setStateFn,
  key
) {
  const { uiTypeCollectionId } = useGetSectionType(sectionId);
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
