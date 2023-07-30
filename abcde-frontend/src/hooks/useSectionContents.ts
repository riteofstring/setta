import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useSectionToParams } from "models/info/sectionToParams";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useOutputValues } from "./useOutputNames";
import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useGetCurrObjParamKwargInfos(sectionId: string) {
  const selectedItem = useGetSectionInfo(sectionId, "selectedItem");
  const paramInfos = useGetParamInfos(sectionId);
  const kwargInfos = useGetKwargInfos(sectionId, selectedItem);
  return [...paramInfos, ...kwargInfos];
}

export function useGetAllCallables(sectionId: string) {
  return useSectionToParams((x) => x.callables[sectionId] ?? [], _.isEqual);
}

export function useGetKwargInfos(sectionId: string, objInfoId: string) {
  const kwargColId = useGetSectionInfo(sectionId, "kwargColId");
  const kwargIds = useKwargCols(
    (x) => x.x[kwargColId][objInfoId] ?? [],
    _.isEqual
  );
  return useCodeInfo((x) => kwargIds.map((y) => x.allCodeInfo[y]), _.isEqual);
}

export function useGetParamInfos(sectionId: string) {
  return useSectionToParams((x) => x.params[sectionId] ?? [], _.isEqual);
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
  const groupId = useGetSectionInfo(sectionId, "outputGroup");
  return useOutputValues(groupId);
}
