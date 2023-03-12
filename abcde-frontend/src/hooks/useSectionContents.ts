import { CodeInfoType } from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import {
  findAllCallables,
  findAllParameterCollections,
} from "thunks/codeInfo/getDescendants";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useOutputValues } from "./useOutputNames";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useGetCurrObjParamKwargInfos(sectionId: string) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  console.log("selectedItem", selectedItem);
  const paramInfos = useGetParamInfos(sectionId, selectedItem);
  console.log("paramInfos", paramInfos);
  const kwargInfos = useGetKwargInfos(sectionId, selectedItem);
  console.log("kwargInfos", kwargInfos);
  return [...paramInfos, ...kwargInfos];
}

function useGetCollectionChildren(sectionId: string, fn) {
  const collectionIds = useGetSectionTypeConfig(sectionId, "collections");
  console.log("collectionIds", collectionIds);
  return useCodeInfo(
    (x) => ([] as CodeInfoType[]).concat(fn(x.allCodeInfo, collectionIds)),
    _.isEqual
  );
}

export function useGetAllCallables(sectionId: string) {
  return useGetCollectionChildren(sectionId, findAllCallables);
}

function useGetAllParamCollections(sectionId: string) {
  return useGetCollectionChildren(sectionId, findAllParameterCollections);
}

function useGetKwargIds(sectionId: string, objInfoId: string) {
  const kwargColId = useGetSectionConfig(sectionId, "kwargColId");
  return useKwargCols(
    (x) => (objInfoId in x.x[kwargColId] ? x.x[kwargColId][objInfoId] : []),
    _.isEqual
  );
}

export function useGetKwargInfos(sectionId: string, objInfoId: string) {
  const kwargIds = useGetKwargIds(sectionId, objInfoId);
  return useCodeInfo((x) => kwargIds.map((y) => x.allCodeInfo[y]), _.isEqual);
}

export function useGetParamInfos(sectionId: string, objInfoId: string) {
  const objParamInfos = useCodeInfo((x) => x.params[objInfoId], _.isEqual);
  const paramCollections = useGetAllParamCollections(sectionId);
  console.log("objParamInfos", objParamInfos);
  console.log("paramCollections", paramCollections);
  return [...objParamInfos, ...paramCollections];
}

export function useGetSelectedCollections(sectionId: string) {
  const collectionIds = useGetSectionTypeConfig(sectionId, "collections");
  return useCodeInfo((x) => _.pick(x.allCodeInfo, collectionIds), _.isEqual);
}

export function useGetSelectedCollectionsForSectionConfig(sectionId: string) {
  const collections = useGetSelectedCollections(sectionId);
  return useCodeInfo(
    (x) => assembleCollectionsForSectionConfig(x.allCodeInfo, collections),
    _.isEqual
  );
}

export function useGetSelectedOutputValues(sectionId: string) {
  const groupId = useGetSectionTypeConfig(sectionId, "outputGroup");
  return useOutputValues(groupId);
}
