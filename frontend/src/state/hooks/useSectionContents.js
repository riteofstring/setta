import _ from "lodash";
import { useCodeInfo } from "state/definitions";
import { useSectionToParams } from "state/definitions";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useGetSectionInfo } from "./useGetSectionInfo";
import { useOutputValues } from "./useOutputNames";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useGetAllCallables(sectionId) {
  return useSectionToParams((x) => x.callables[sectionId] ?? [], _.isEqual);
}

export function useGetParamInfos(sectionId) {
  return useSectionToParams((x) => x.params[sectionId] ?? [], _.isEqual);
}

export function useGetParamInfosThatHaveNames(sectionId) {
  return useSectionToParams(
    (x) => x.params[sectionId]?.filter((x) => x.name) ?? [],
    _.isEqual,
  );
}

function useGetSelectedCollections(sectionId) {
  const codeInfoId = useGetSectionTypeConfig(sectionId, "codeInfoId");
  return useCodeInfo((x) => _.pick(x.x, x.x[codeInfoId].children), _.isEqual);
}

export function useGetSelectedCollectionsForSectionConfig(sectionId) {
  const collections = useGetSelectedCollections(sectionId);
  return useCodeInfo(
    (x) => assembleCollectionsForSectionConfig(x.x, collections),
    _.isEqual,
  );
}

export function useGetSelectedOutputValues(sectionId) {
  const groupId = useGetSectionInfo(sectionId, "outputGroup");
  return useOutputValues(groupId);
}
