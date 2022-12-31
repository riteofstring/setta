import {
  CodeInfoStateType,
  CodeInfoType,
} from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useGetCurrObjParamKwargInfos(sectionId: string) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  const paramInfos = useGetParamInfos(sectionId, selectedItem);
  const kwargInfos = useGetKwargInfos(sectionId, selectedItem);
  return [...paramInfos, ...kwargInfos];
}

function useGetCollectionChildren<K extends keyof CodeInfoStateType>(
  sectionId: string,
  type: K
) {
  const collectionIds = useGetSectionTypeConfig(sectionId, "collections");
  return useCodeInfo(
    (x) =>
      ([] as CodeInfoType[]).concat(...collectionIds.map((y) => x[type][y])),
    _.isEqual
  );
}

export function useGetAllCallables(sectionId) {
  return useGetCollectionChildren(sectionId, "callables");
}

function useGetAllParamCollections(sectionId) {
  return useGetCollectionChildren(sectionId, "paramCollections");
}

function useGetKwargIds(sectionId: string, objInfoId: string) {
  const kwargColId = useGetSectionConfig(sectionId, "kwargColId");
  return useKwargCols((x) => x.x[kwargColId][objInfoId], _.isEqual);
}

export function useGetKwargInfos(sectionId: string, objInfoId) {
  const kwargIds = useGetKwargIds(sectionId, objInfoId);
  return useCodeInfo((x) => kwargIds.map((y) => x.allCodeInfo[y]), _.isEqual);
}

export function useGetParamInfos(sectionId, objInfoId) {
  const objParamInfos = useCodeInfo((x) => x.params[objInfoId], _.isEqual);
  const paramCollections = useGetAllParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}

export function useGetSelectedCollections(sectionId: string) {
  const collectionIds = useGetSectionTypeConfig(sectionId, "collections");
  return useCodeInfo((x) => _.pick(x.allCollections, collectionIds), _.isEqual);
}

export function useGetSelectedCollectionsForSectionConfig(sectionId: string) {
  const collections = useGetSelectedCollections(sectionId);
  return useCodeInfo(
    (x) => assembleCollectionsForSectionConfig(x.allCodeInfo, collections),
    _.isEqual
  );
}
