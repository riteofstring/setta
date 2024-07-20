import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionToParams } from "models/info/sectionToParams";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useGetSectionInfo } from "../state/sectionInfos/hooks";
import { useOutputValues } from "./useOutputNames";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useGetAllCallables(sectionId: string) {
  return useSectionToParams((x) => x.callables[sectionId] ?? [], _.isEqual);
}

export function useGetParamInfos(sectionId: string) {
  return useSectionToParams((x) => x.params[sectionId] ?? [], _.isEqual);
}

export function useGetParamInfosThatHaveNames(sectionId: string) {
  return useSectionToParams(
    (x) => x.params[sectionId]?.filter((x) => x.name) ?? [],
    _.isEqual,
  );
}

function useGetSelectedCollections(sectionId: string) {
  const codeInfoId = useGetSectionTypeConfig(sectionId, "codeInfoId");
  return useCodeInfo((x) => _.pick(x.x, x.x[codeInfoId].children), _.isEqual);
}

export function useGetSelectedCollectionsForSectionConfig(sectionId: string) {
  const collections = useGetSelectedCollections(sectionId);
  return useCodeInfo(
    (x) => assembleCollectionsForSectionConfig(x.x, collections),
    _.isEqual,
  );
}

export function useGetSelectedOutputValues(sectionId: string) {
  const groupId = useGetSectionInfo(sectionId, "outputGroup");
  return useOutputValues(groupId);
}
