import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";

import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";
import { getInfo } from "./utils";

export function useGetCurrObjParamKwargInfos(sectionId) {
  const { selectedItem } = useGetSectionInfo(sectionId);
  return useGetObjParamKwargInfos(sectionId, selectedItem);
}

// TODO: SPLIT UP
export function useGetObjParamKwargInfos(sectionId, objInfoId) {
  const allObjInfo = useStoreState((x) => x.master.allObjInfo);
  console.log("useGetObjParamKwargInfos");
  console.log("objInfoId", objInfoId);
  console.log("allObjInfo", allObjInfo);
  const objInfo = useStoreState((x) => x.master.allObjInfo[objInfoId]);
  const paramInfos = useGetAllParamInfos(sectionId, objInfo);
  const kwargInfos = useGetKwargInfos(sectionId, objInfo);
  return { objInfo, paramInfos, kwargInfos };
}

function getCollections(
  collectionIds,
  allObjInfo,
  allCollections,
  requiresSearch
) {
  const collections = collectionIds
    .map((x) => allCollections[x])
    .filter((x) => x && (requiresSearch ? x.requiresSearch : true));
  const ids = [].concat(...collections.map((x) => x.children));
  return ids.map((x) => allObjInfo[x]);
}

export function useGetCollections(sectionId, requiresSearch) {
  const allObjInfo = useStoreState((x) => x.master.allObjInfo);
  const allCollections = useStoreState((x) => x.master.allCollections);
  const sectionType = useGetSectionType(sectionId);
  if (sectionId) {
    const collectionIds = sectionType.config.collections;
    console.log("collectionIds", collectionIds);
    return getCollections(
      collectionIds,
      allObjInfo,
      allCollections,
      requiresSearch
    );
  }
  return [];
}

export function useGetObjInfos(sectionId) {
  return useGetCollections(sectionId);
}

function useGetParamCollections(sectionId) {
  return useGetCollections(sectionId);
}

function useGetKwargIds(sectionId, objInfo) {
  const { kwargCollectionId } = useGetSectionInfo(sectionId);
  return defaultState(
    useStoreState(
      (x) => getInfo(x.objInfos)[kwargCollectionId]?.[objInfo.id]?.kwargIds
    ),
    () => []
  );
}

function useGetKwargInfos(sectionId, objInfo) {
  const kwargIds = useGetKwargIds(sectionId, objInfo);
  const kwargInfoState = useStoreState(
    (x) => kwargIds.map((y) => getInfo(x.kwargInfos)[y]),
    _.isEqual
  );
  return kwargInfoState;
}

function useGetAllParamInfos(sectionId, objInfo) {
  console.log("objInfo", objInfo);
  const allObjInfo = useStoreState((x) => x.master.allObjInfo);
  const childrenList = objInfo ? objInfo.children : [];
  console.log("childrenList", childrenList);
  const objParamInfos = childrenList.map((x) => allObjInfo[x]);
  const paramCollections = useGetParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}

export function useGetAllParamAndKwargInfos(sectionId, objInfo) {
  return [
    ...useGetAllParamInfos(sectionId, objInfo),
    ...useGetKwargInfos(sectionId, objInfo),
  ];
}
