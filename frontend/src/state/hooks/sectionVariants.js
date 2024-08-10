import _ from "lodash";
import { useSectionInfos, useSectionVariants } from "state/definitions";
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
    (x) => x.x[sectionId],
  );
  return { dbSource, variantId, previewVariantId };
}
