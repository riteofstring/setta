import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";
import { maybeUseNullId } from "./useKwarg";
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
  const objInfo = useStoreState((x) => x.codeInfo.allObjInfo[objInfoId]);
  const paramInfos = useGetAllParamInfos(sectionId, objInfo);
  const kwargInfos = useGetKwargInfos(sectionId, objInfo);
  if (returnAsOneList) {
    return [...paramInfos, ...kwargInfos];
  }
  return { paramInfos, kwargInfos };
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

function useGetKwargIds(sectionId, objInfo) {
  const { kwargColId } = useGetSectionConfig(sectionId);
  const objInfoId = maybeUseNullId(objInfo?.id);
  return defaultState(
    useStoreState((x) => getInfo(x.objInfos)[kwargColId]?.[objInfoId]),
    () => []
  );
}

function useGetKwargInfos(sectionId, objInfo) {
  const kwargIds = useGetKwargIds(sectionId, objInfo);
  const kwargInfoState = useStoreState(
    (x) => kwargIds.map((y) => x.codeInfo.allObjInfo[y]),
    _.isEqual
  );
  return kwargInfoState;
}

function useGetAllParamInfos(sectionId, objInfo) {
  const objParamInfos = useStoreState(
    (x) => (objInfo ? x.codeInfo.params[objInfo.id] : []),
    _.isEqual
  );
  const paramCollections = useGetAllParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}
