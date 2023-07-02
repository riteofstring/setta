import { FN } from "abcde-utils/src/constants";
import {
  findAllCallablesOfCallables,
  findAllCallablesOfCollections,
  findAllParameterCollections,
  findAllParameters,
} from "abcde-utils/src/getDescendants";
import { CodeInfoType } from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useSectionToParams } from "models/info/sectionToParams";
import useDeepCompareEffect from "use-deep-compare-effect";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useOutputValues } from "./useOutputNames";
import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType, useGetSectionTypeConfig } from "./useSectionType";

export function useGetCurrObjParamKwargInfos(sectionId: string) {
  const selectedItem = useGetSectionInfo(sectionId, "selectedItem");
  const paramInfos = useGetParamInfos(sectionId, selectedItem);
  const kwargInfos = useGetKwargInfos(sectionId, selectedItem);
  return [...paramInfos, ...kwargInfos];
}

function useGetCollectionChildren(sectionId: string, fn) {
  const collectionIds = useGetSectionTypeConfig(sectionId, "collections");
  return useCodeInfo(
    (x) => ([] as CodeInfoType[]).concat(fn(x.allCodeInfo, collectionIds)),
    _.isEqual
  );
}

export function useGetAllCallables(sectionId: string) {
  const sectionType = useGetSectionType(sectionId, "type");
  const fn =
    sectionType === FN
      ? findAllCallablesOfCallables
      : findAllCallablesOfCollections;
  return useGetCollectionChildren(sectionId, fn);
}

function useGetAllParamCollections(sectionId: string) {
  return useGetCollectionChildren(sectionId, findAllParameterCollections);
}

function useGetKwargIds(sectionId: string, objInfoId: string) {
  const kwargColId = useGetSectionInfo(sectionId, "kwargColId");
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
  const objParamInfos = useCodeInfo(
    (x) => findAllParameters(x.allCodeInfo, [objInfoId]),
    _.isEqual
  );
  const paramCollections = useGetAllParamCollections(sectionId);

  useDeepCompareEffect(() => {
    const s = useSectionToParams.getState();
    s.setParams({ sectionId, params: objParamInfos });
    s.setParamCollections({ sectionId, paramCollections });
  }, [objParamInfos, paramCollections]);

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
