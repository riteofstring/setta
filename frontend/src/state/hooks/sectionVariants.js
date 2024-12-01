import _ from "lodash";
import {
  getDisplayedSectionVariant,
  getSectionVariant,
} from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";

export function useGetParamEnteredValueAndKeywordPositions(
  sectionId,
  paramInfoId,
) {
  return useSectionInfos((x) => {
    const vals = getDisplayedSectionVariant(sectionId, x).values;
    if (paramInfoId in vals) {
      return {
        value: vals[paramInfoId].value,
        keywordPositions: vals[paramInfoId].keywordPositions,
      };
    }
    return { value: "", keywordPositions: [] };
  }, _.isEqual);
}

export function useGetSectionVariantNames(sectionId) {
  return useSectionInfos(
    (x) =>
      sectionId
        ? x.x[sectionId].variantIds.map((e) => ({
            id: e,
            name: x.variants[e].name,
          }))
        : [],
    _.isEqual,
  );
}

export function useListElementIdx(sectionId) {
  return useSectionInfos((x) => {
    const parentId = x.x[sectionId].parentId;
    return getDisplayedSectionVariant(parentId).children.indexOf(sectionId);
  });
}

export function useSectionVariantIsFrozen(sectionId) {
  return useSectionInfos((x) => getSectionVariant(sectionId, x).isFrozen);
}

export function useInfoAreaDescriptionAndEditability(sectionId) {
  return useSectionInfos((x) => {
    return {
      ...getInfoAreaDescription(sectionId, x),
      variantIsDisabled: getSectionVariant(sectionId, x).isFrozen,
    };
  }, _.isEqual);
}

export function getInfoAreaDescription(sectionId, state) {
  return {
    renderMarkdown: state.x[sectionId].renderMarkdown,
    description: getDisplayedSectionVariant(sectionId, state).description,
  };
}
