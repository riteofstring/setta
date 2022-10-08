import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";

import { useGetSectionType } from "./useSectionType";
import { getInfo } from "./utils";

export function useGetCurrObjParamKwargInfos(sectionId) {
  const { selectedItem } = useGetSectionConfig(sectionId);
  return useGetObjParamKwargInfos(sectionId, selectedItem, true);
}

// TODO: SPLIT UP
export function useGetObjParamKwargInfos(
  sectionId,
  objInfoId,
  returnAsOneList
) {
  const objInfo = useStoreState((x) => x.master.allObjInfo[objInfoId]);
  const paramInfos = useGetAllParamInfos(sectionId, objInfo);
  const kwargInfos = useGetKwargInfos(sectionId, objInfo);
  if (returnAsOneList) {
    return [...paramInfos, ...kwargInfos];
  }
  return { paramInfos, kwargInfos };
}

function getCollections(
  collectionIds,
  allObjInfo,
  allCollections,
  requiresSearch
) {
  const collections = collectionIds
    .map((x) => allCollections[x])
    .filter((x) => x && x.requiresSearch === requiresSearch);
  const ids = [].concat(...collections.map((x) => x.children));
  return ids.map((x) => allObjInfo[x]);
}

export function useGetCollections(sectionId, requiresSearch) {
  const allObjInfo = useStoreState((x) => x.master.allObjInfo);
  const allCollections = useStoreState((x) => x.master.allCollections);
  const sectionType = useGetSectionType(sectionId);
  if (sectionId) {
    const collectionIds = sectionType.config.collections;
    return getCollections(
      collectionIds,
      allObjInfo,
      allCollections,
      requiresSearch
    );
  }
  return [];
}

function useGetKwargIds(sectionId, objInfo) {
  const { kwargCollectionId } = useGetSectionConfig(sectionId);
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
  const allObjInfo = useStoreState((x) => x.master.allObjInfo);
  const childrenList = objInfo ? objInfo.children : [];
  const objParamInfos = childrenList.map((x) => allObjInfo[x]);
  const paramCollections = useGetCollections(sectionId, false);
  return [...objParamInfos, ...paramCollections];
}
