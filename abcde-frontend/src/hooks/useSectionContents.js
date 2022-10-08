import {
  findAllCallables,
  findAllParameterCollections,
  findAllParameters,
} from "classes/infoFactory";
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

function useFindAllDescendants(sectionId, fn) {
  const allObjInfo = useStoreState((x) => x.master.allObjInfo);
  const sectionType = useGetSectionType(sectionId);
  if (sectionId) {
    const collectionIds = sectionType.config.collections;
    return fn(allObjInfo, collectionIds);
  }
  return [];
}

export function useFindAllCallables(sectionId) {
  return useFindAllDescendants(sectionId, findAllCallables);
}

function useFindAllParameterCollections(sectionId) {
  return useFindAllDescendants(sectionId, findAllParameterCollections);
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
  const objParamInfos = findAllParameters(allObjInfo, [objInfo?.id]);
  const paramCollections = useFindAllParameterCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}
