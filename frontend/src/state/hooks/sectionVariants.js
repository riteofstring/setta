import _ from "lodash";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import { getMappedSectionDBSource } from "state/getters/sectionInfo";
import { useGetSectionInfo, useMappedSectionDBSource } from "./sections";

export function useGetParamEnteredValue(sectionId, paramInfoId) {
  const { dbSource, variantId, previewVariantId } =
    useSectionVariantMetadataIds(sectionId);
  return useSectionVariants((x) => {
    if (dbSource in x.x) {
      return x.x[dbSource][previewVariantId ?? variantId].values[paramInfoId];
    }
    return "";
  });
}

export function useGetSectionVariantNames(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const variantIds = useGetSectionInfo(sectionId, "variantIds");
  return useSectionVariants((x) => {
    if (dbSource in x.x) {
      return variantIds.map((e) => ({ id: e, name: x.x[dbSource][e].name }));
    }
    return [];
  }, _.isEqual);
}

export function useSectionEnteredValues(sectionId) {
  const { dbSource, variantId, previewVariantId } =
    useSectionVariantMetadataIds(sectionId);
  return useSectionVariants((x) => {
    if (dbSource in x.x) {
      return Object.values(x.x[dbSource][previewVariantId ?? variantId].values);
    }
    return [];
  }, _.isEqual);
}

function useSectionVariantMetadataIds(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const { variantId, previewVariantId } = useSectionInfos(
    (x) => ({
      variantId: x.x[sectionId].variantId,
      previewVariantId: x.x[sectionId].previewVariantId,
    }),
    _.isEqual,
  );
  return { dbSource, variantId, previewVariantId };
}

export function useSectionIdToChildren() {
  const sectionIdToVariantMetadata = useSectionInfos((x) =>
    _.mapValues(x.x, (v) => ({
      dbSource: getMappedSectionDBSource(v.id, x.x),
      variantId: v.variantId,
    })),
  );
  return useSectionVariants(
    (x) =>
      _.mapValues(
        sectionIdToVariantMetadata,
        (v) => x.x[v.dbSource][v.variantId].children,
      ),
    _.isEqual,
  );
}

export function useListElementIdx(sectionId) {
  const parentId = useGetSectionInfo(sectionId, "parentId");
  const { dbSource, variantId } = useSectionVariantMetadataIds(parentId);
  return useSectionVariants((x) =>
    x.x[dbSource][variantId].children.indexOf(sectionId),
  );
}

export function useSectionSelectedItem(sectionId) {
  const { dbSource, variantId, previewVariantId } =
    useSectionVariantMetadataIds(sectionId);

  return useSectionVariants(
    (x) => x.x[dbSource][previewVariantId ?? variantId].selectedItem,
  );
}
