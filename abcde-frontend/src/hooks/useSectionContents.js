import { NULL_OBJ_INFO } from "classes/immutableInfo";
import { useStoreState } from "easy-peasy";
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
  const objInfo = useGetObjInfos(sectionId, objInfoId);
  const paramInfos = useGetAllParamInfos(sectionId, objInfo);
  const kwargInfos = useGetKwargInfos(sectionId, objInfo);
  return { objInfo, paramInfos, kwargInfos };
}

function getXInfos(collectionIds, allCollections, infoId) {
  const collections = collectionIds.map((x) => allCollections.children[x]);
  const output = _.merge({}, ...collections.map((x) => x.children));
  if (infoId) {
    return output[infoId];
  }
  return Object.values(output);
}

function useGetXInfosFromSection(
  collectionName,
  allCollectionName,
  sectionId,
  infoId
) {
  const allCollections = useStoreState((x) => x.master[allCollectionName]);
  const sectionType = useGetSectionType(sectionId);
  if (sectionId) {
    const collectionIds = sectionType.config[collectionName];
    return getXInfos(collectionIds, allCollections, infoId);
  }
  return [];
}

export function useGetObjInfos(sectionId, infoId) {
  const objs = useGetXInfosFromSection(
    "objects",
    "allObjCollections",
    sectionId,
    infoId
  );
  if (infoId === null) {
    return NULL_OBJ_INFO;
  }
  return objs;
}

function useGetParamCollections(sectionId, infoId) {
  return useGetXInfosFromSection(
    "parameters",
    "allParamCollections",
    sectionId,
    infoId
  );
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
  const objParamInfos = objInfo?.children
    ? Object.values(objInfo.children)
    : [];
  const paramCollections = useGetParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}

export function useGetAllParamAndKwargInfos(sectionId, objInfo) {
  return [
    ...useGetAllParamInfos(sectionId, objInfo),
    ...useGetKwargInfos(sectionId, objInfo),
  ];
}
