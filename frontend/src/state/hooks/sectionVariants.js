import _ from "lodash";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import { useGetSectionInfo } from "./sections";

export function useGetParamEnteredValue(sectionId, paramInfoId) {
  const variantIdToShow = useSectionVariantIdToShow(sectionId);
  return useSectionVariants((x) => {
    const vals = x.x[variantIdToShow].values;
    if (paramInfoId in vals) {
      return vals[paramInfoId].value;
    }
    return "";
  });
}

export function useGetParamKeywordPositions(sectionId, paramInfoId) {
  const variantIdToShow = useSectionVariantIdToShow(sectionId);
  return useSectionVariants((x) => {
    if (paramInfoId) {
      const vals = x.x[variantIdToShow].values;
      if (paramInfoId in vals) {
        return vals[paramInfoId].keywordPositions;
      }
    }
    return [];
  }, _.isEqual);
}

export function useGetSectionVariantNames(sectionId) {
  const variantIds = useGetSectionInfo(sectionId, "variantIds");
  return useSectionVariants(
    (x) => variantIds.map((e) => ({ id: e, name: x.x[e].name })),
    _.isEqual,
  );
}

export function useSectionEnteredValues(sectionId) {
  const variantIdToShow = useSectionVariantIdToShow(sectionId);
  return useSectionVariants(
    (x) => Object.values(x.x[variantIdToShow].values),
    _.isEqual,
  );
}

function useSectionVariantIdToShow(sectionId) {
  return useSectionInfos((x) => {
    const s = x.x[sectionId];
    return s.previewVariantId ?? s.variantId;
  });
}

export function useSectionIdToChildren() {
  const sectionIdToVariantMetadata = useSectionInfos((x) =>
    _.mapValues(x.x, (v) => ({
      variantId: v.variantId,
    })),
  );
  return useSectionVariants(
    (x) =>
      _.mapValues(sectionIdToVariantMetadata, (v) => x.x[v.variantId].children),
    _.isEqual,
  );
}

export function useListElementIdx(sectionId) {
  const parentId = useGetSectionInfo(sectionId, "parentId");
  const variantIdToShow = useSectionVariantIdToShow(parentId);
  return useSectionVariants((x) =>
    x.x[variantIdToShow].children.indexOf(sectionId),
  );
}

function useSectionVariantAttr(sectionId, attr, equalityFn) {
  const variantIdToShow = useSectionVariantIdToShow(sectionId);
  return useSectionVariants((x) => x.x[variantIdToShow][attr], equalityFn);
}

export function useSectionSelectedItem(sectionId) {
  return useSectionVariantAttr(sectionId, "selectedItem");
}

export function useSectionCode(sectionId) {
  return useSectionVariantAttr(sectionId, "code");
}

export function useSectionDescription(sectionId) {
  return useSectionVariantAttr(sectionId, "description");
}

export function useSectionCodeInfoColId(sectionId) {
  return useSectionVariantAttr(sectionId, "codeInfoColId");
}

export function useSectionKeywordPositions(sectionId) {
  return useSectionVariantAttr(sectionId, "keywordPositions", _.isEqual);
}

export function useSectionVariantIsFrozen(sectionId) {
  const variantId = useSectionInfos((x) => x.x[sectionId].variantId);
  return useSectionVariants((x) => x.x[variantId].isFrozen);
}
