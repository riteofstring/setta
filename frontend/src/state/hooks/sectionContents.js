import _ from "lodash";
import { useCodeInfo, useSectionToParams } from "state/definitions";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useOutputValues } from "./outputs";
import { useGetSectionInfo } from "./sections";

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

export function useSectionParamInfosWithDepths(sectionId) {
  const topLevelParams = useSectionToParams(
    (x) => x.params[sectionId] ?? [],
    _.isEqual,
  );
  const topLevelIds = topLevelParams.map((x) => x.id);
  return useCodeInfo((x) => selectParamInfosWithDepth(topLevelIds, x.x));
}

function selectParamInfosWithDepth(topLevelIds, codeInfoState) {
  const output = [];
  for (const paramInfoId of topLevelIds) {
    output.push(
      ...selectParamInfosWithDepthHelper(
        codeInfoState,
        paramInfoId,
        codeInfoState[paramInfoId].children,
        0,
      ),
    );
  }
  return output;
}

function selectParamInfosWithDepthHelper(
  codeInfoState,
  paramInfoId,
  children,
  depth,
) {
  const output = [{ paramInfo: codeInfoState[paramInfoId], depth: depth }];

  for (const childId of children) {
    output.push(
      ...selectParamInfosWithDepthHelper(
        codeInfoState,
        childId,
        codeInfoState[childId].children,
        depth + 1,
      ),
    );
  }
  return output;
}
