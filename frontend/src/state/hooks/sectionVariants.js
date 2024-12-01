import _ from "lodash";
import {
  getSectionVariant,
  getSectionVariantIdToShow,
  getSectionVariantToShow,
} from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";

export function useGetParamEnteredValueAndKeywordPositions(
  sectionId,
  paramInfoId,
) {
  return useSectionInfos((x) => {
    const variantIdToShow = getSectionVariantIdToShow(sectionId, x);
    const vals = x.variants[variantIdToShow].values;
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
    const variantIdToShow = getSectionVariantIdToShow(parentId, x);
    return x.variants[variantIdToShow].children.indexOf(sectionId);
  });
}

function useSectionVariantAttr(sectionId, attr, equalityFn) {
  return useSectionInfos((x) => {
    const variantIdToShow = getSectionVariantIdToShow(sectionId, x);
    return x.variants[variantIdToShow][attr];
  }, equalityFn);
}

export function useSectionCode(sectionId) {
  return useSectionVariantAttr(sectionId, "code");
}

export function useSectionKeywordPositions(sectionId) {
  return useSectionVariantAttr(sectionId, "keywordPositions", _.isEqual);
}

export function useSectionVariantIsFrozen(sectionId) {
  return useSectionInfos((x) => getSectionVariant(sectionId, x).isFrozen);
}

export function useInfoAreaDescription(sectionId) {
  return useSectionInfos((x) => {
    return {
      renderMarkdown: x.x[sectionId].renderMarkdown,
      description: getSectionVariantToShow(sectionId, x).description,
    };
  }, _.isEqual);
}
