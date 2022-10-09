import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";
import { maybeUseNullId } from "./useKwarg";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetSectionType } from "./useSectionType";
import { getInfo } from "./utils";

export function useGetCurrObjParamKwargInfos(sectionId) {
  const { selectedItem } = useGetSectionConfig(sectionId);
  const paramInfos = useGetAllParamInfos(sectionId, selectedItem);
  const kwargInfos = useGetKwargInfos(sectionId, selectedItem);
  return [...paramInfos, ...kwargInfos];
}

function useGetCollectionChildren(sectionId, type) {
  const sectionType = useGetSectionType(sectionId);
  const collectionIds = sectionType.config
    ? sectionType.config.collections
    : [];
  return useStoreState(
    (x) => [].concat(...collectionIds.map((y) => x.codeInfo[type][y])),
    _.isEqual
  );
}

export function useGetAllCallables(sectionId) {
  return useGetCollectionChildren(sectionId, "callables");
}

function useGetAllParamCollections(sectionId) {
  return useGetCollectionChildren(sectionId, "paramCollections");
}

function useGetKwargIds(sectionId, objInfoId) {
  const { kwargColId } = useGetSectionConfig(sectionId);
  return defaultState(
    useStoreState((x) => getInfo(x.objInfos)[kwargColId]?.[objInfoId]),
    () => []
  );
}

export function useGetKwargInfos(sectionId, objInfoId) {
  const kwargIds = useGetKwargIds(sectionId, maybeUseNullId(objInfoId));
  return useStoreState(
    (x) => kwargIds.map((y) => x.codeInfo.allObjInfo[y]),
    _.isEqual
  );
}

export function useGetAllParamInfos(sectionId, objInfoId) {
  const objParamInfos = useStoreState(
    (x) => (objInfoId ? x.codeInfo.params[objInfoId] : []),
    _.isEqual
  );
  const paramCollections = useGetAllParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}
