import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState, maybeUseNullId } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetSectionType } from "./useSectionType";

export function useGetCurrObjParamKwargInfos(sectionId) {
  const [selectedItem] = useGetSectionConfig(sectionId, ["selectedItem"]);
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
  const [kwargColId] = useGetSectionConfig(sectionId, ["kwargColId"]);
  return defaultState(
    useStoreState((x) => x.objInfos.x[kwargColId]?.[objInfoId]),
    () => []
  );
}

export function useGetKwargInfos(sectionId, objInfoId) {
  const kwargIds = useGetKwargIds(sectionId, maybeUseNullId(objInfoId));
  return useStoreState(
    (x) => kwargIds.map((y) => x.codeInfo.allCodeInfo[y]),
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
