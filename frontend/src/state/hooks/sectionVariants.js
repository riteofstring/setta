import _ from "lodash";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import { useGetSectionInfo } from "./sections";

export function useGetParamEnteredValue(sectionId, paramInfoId) {
  const { variantId, previewVariantId } =
    useSectionVariantMetadataIds(sectionId);
  return useSectionVariants((x) => {
    const vals = x.x[previewVariantId ?? variantId].values;
    if (paramInfoId in vals) {
      return vals[paramInfoId].value;
    }
    return "";
  });
}

export function useGetParamKeywordPositions(sectionId, paramInfoId) {
  const { variantId, previewVariantId } =
    useSectionVariantMetadataIds(sectionId);
  return useSectionVariants((x) => {
    if (paramInfoId) {
      const vals = x.x[previewVariantId ?? variantId].values;
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
  const { variantId, previewVariantId } =
    useSectionVariantMetadataIds(sectionId);
  return useSectionVariants(
    (x) => Object.values(x.x[previewVariantId ?? variantId].values),
    _.isEqual,
  );
}

function useSectionVariantMetadataIds(sectionId) {
  const { variantId, previewVariantId } = useSectionInfos(
    (x) => ({
      variantId: x.x[sectionId].variantId,
      previewVariantId: x.x[sectionId].previewVariantId,
    }),
    _.isEqual,
  );
  return { variantId, previewVariantId };
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
  const { variantId, previewVariantId } =
    useSectionVariantMetadataIds(parentId);
  return useSectionVariants((x) =>
    x.x[previewVariantId ?? variantId].children.indexOf(sectionId),
  );
}

function useSectionVariantAttr(sectionId, attr, equalityFn) {
  const { variantId, previewVariantId } =
    useSectionVariantMetadataIds(sectionId);

  return useSectionVariants(
    (x) => x.x[previewVariantId ?? variantId][attr],
    equalityFn,
  );
}

export function useSectionSelectedItem(sectionId) {
  return useSectionVariantAttr(sectionId, "selectedItem");
}

export function useSectionCode(sectionId) {
  return useSectionVariantAttr(sectionId, "code");
}

export function useSectionCodeInfoColId(sectionId) {
  return useSectionVariantAttr(sectionId, "codeInfoColId");
}

export function useSectionKeywordPositions(sectionId) {
  return useSectionVariantAttr(sectionId, "keywordPositions", _.isEqual);
}

export function useSectionVariantIsFrozen(sectionId) {
  return useSectionVariantAttr(sectionId, "isFrozen", _.isEqual);
}
