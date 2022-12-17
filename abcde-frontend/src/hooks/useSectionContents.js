import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useObjInfos } from "models/info/objInfos";
import { defaultState, maybeUseNullId } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useGetCurrObjParamKwargInfos(sectionId) {
  const [selectedItem] = useGetSectionConfig(sectionId, ["selectedItem"]);
  const paramInfos = useGetParamInfos(sectionId, selectedItem);
  const kwargInfos = useGetKwargInfos(sectionId, selectedItem);
  return [...paramInfos, ...kwargInfos];
}

function useGetCollectionChildren(sectionId, type) {
  const [_collectionIds] = useGetSectionTypeConfig(sectionId, ["collections"]);
  const collectionIds = _collectionIds ? _collectionIds : [];
  return useCodeInfo(
    (x) => [].concat(...collectionIds.map((y) => x[type][y])),
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
    useObjInfos((x) => x.x[kwargColId]?.[objInfoId]),
    () => []
  );
}

export function useGetKwargInfos(sectionId, objInfoId) {
  const kwargIds = useGetKwargIds(sectionId, maybeUseNullId(objInfoId));
  return useCodeInfo((x) => kwargIds.map((y) => x.allCodeInfo[y]), _.isEqual);
}

export function useGetParamInfos(sectionId, objInfoId) {
  const objParamInfos = useCodeInfo(
    (x) => (objInfoId ? x.params[objInfoId] : []),
    _.isEqual
  );
  const paramCollections = useGetAllParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}

export function useGetSelectedCollections(sectionId) {
  const collections = useGetSectionTypeConfig(sectionId, ["collections"]);
  console.log("collections", collections);
  return useCodeInfo((x) => _.pick(x.allCollections, collections), _.isEqual);
}
