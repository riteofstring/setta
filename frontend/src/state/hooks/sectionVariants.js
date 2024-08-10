import _ from "lodash";
import { useSectionVariants } from "state/definitions";
import { useGetSectionInfo, useMappedSectionDBSource } from "./sections";

export function useGetParamEnteredValue(sectionId, paramInfoId) {
  const { dbSource, evColId, previewEVColId } = useEVColMetadataIds(sectionId);
  return useSectionVariants((x) => {
    if (dbSource in x.x) {
      return x.x[dbSource][previewEVColId ?? evColId].values[paramInfoId];
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
  const { dbSource, evColId, previewEVColId } = useEVColMetadataIds(sectionId);
  return useSectionVariants((x) => {
    if (dbSource in x.x) {
      return Object.values(x.x[dbSource][previewEVColId ?? evColId].values);
    }
    return [];
  }, _.isEqual);
}

function useEVColMetadataIds(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const evColId = useGetSectionInfo(sectionId, "evColId");
  const previewEVColId = useGetSectionInfo(sectionId, "previewEVColId");
  return { dbSource, evColId, previewEVColId };
}
