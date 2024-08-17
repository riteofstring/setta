import C from "constants/constants.json";
import _ from "lodash";
import {
  useCodeInfo,
  useSectionInfos,
  useSectionToParams,
} from "state/definitions";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useOutputValues } from "./outputs";
import { useGetSectionInfo } from "./sections";
import { useSectionSelectedItem } from "./sectionVariants";

export function useGetAllCallables(sectionId) {
  const codeInfoId = useSectionInfos((x) => x.x[sectionId].codeInfoId);
  return useCodeInfo(
    (x) => x.x[codeInfoId].children.filter((c) => c.rcType === C.CALLABLE),
    _.isEqual,
  );
}

export function useGetParamInfos(sectionId) {
  const selectedItem = useSectionSelectedItem(sectionId);
  return useCodeInfo(
    (x) => x.x[selectedItem].children.filter((c) => c.rcType === C.PARAMETER),
    _.isEqual,
  );
}

export function useGetParamInfosThatHaveNames(sectionId) {
  return useSectionToParams(
    (x) => x.params[sectionId]?.filter((x) => x.name) ?? [],
    _.isEqual,
  );
}

function useGetSelectedCollections(sectionId) {
  const codeInfoId = useGetSectionInfo(sectionId, "codeInfoId");
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

export function useHasParams(sectionId) {
  return useSectionToParams((x) => (x.params[sectionId] ?? []).length > 0);
}
