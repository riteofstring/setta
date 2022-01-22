import { useStoreState } from "easy-peasy";
import { defaultState } from "utils/utils";

import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";
import { getInfo } from "./utils";

export function useGetCurrObjParamKwargInfos(sectionId) {
  const { selectedItem } = useGetSectionInfo(sectionId);
  return useGetObjParamKwargInfos(sectionId, selectedItem);
}

export function useGetObjParamKwargInfos(sectionId, objInfoId) {
  const objInfo = useGetObjInfos(sectionId, objInfoId);
  const paramInfos = useGetAllParamInfos(sectionId, objInfo);
  const kwargInfos = useGetKwargInfos(sectionId, objInfo);
  return { objInfo, paramInfos, kwargInfos };
}

export function getXInfos(collectionIds, allCollections, infoId = null) {
  const collections = collectionIds.map((x) => allCollections.children[x]);
  const output = _.merge({}, ...collections.map((x) => x.children));
  if (infoId) {
    return output[infoId];
  }
  return Object.values(output);
}

export function useGetXInfosFromSection(
  collectionName,
  allCollectionName,
  sectionId,
  infoId = null
) {
  const allCollections = useStoreState((x) => x.master[allCollectionName]);
  const sectionType = useGetSectionType(sectionId);
  console.log("sectionType", sectionType, collectionName);
  if (sectionId) {
    const collectionIds = sectionType.config[collectionName];
    return getXInfos(collectionIds, allCollections, infoId);
  }
  return [];
}

export function useGetObjInfos(sectionId, infoId = null) {
  return useGetXInfosFromSection(
    "objects",
    "allObjCollections",
    sectionId,
    infoId
  );
}

export function useGetParamCollections(sectionId, infoId = null) {
  return useGetXInfosFromSection(
    "parameters",
    "allParamCollections",
    sectionId,
    infoId
  );
}

export function useGetKwargIds(sectionId, objInfo) {
  const { kwargCollectionId } = useGetSectionInfo(sectionId);
  return defaultState(
    useStoreState(
      (x) => getInfo(x.objInfos)[kwargCollectionId]?.[objInfo.id]?.kwargIds
    ),
    () => []
  );
}

export function useGetKwargInfos(sectionId, objInfo) {
  const kwargIds = useGetKwargIds(sectionId, objInfo);
  const kwargInfoState = useStoreState(
    (x) => kwargIds.map((y) => getInfo(x.kwargInfos)[y]),
    _.isEqual
  );
  return kwargInfoState;
}

export function useGetAllParamInfos(sectionId, objInfo) {
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
