import _ from "lodash";
import { useEVCols } from "state/definitions/evCols";
import {
  useGetSectionInfo,
  useMappedSectionDBSource,
} from "./useGetSectionInfo";

export function useGetParamEnteredValue(sectionId, paramInfoId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const evColId = useGetSectionInfo(sectionId, "evColId");
  const previewEVColId = useGetSectionInfo(sectionId, "previewEVColId");

  // console.log("dbSource", dbSource);
  // console.log("evColId", evColId);
  // console.log("previewEVColId", previewEVColId);

  return useEVCols((x) => {
    if (dbSource in x.x) {
      return x.x[dbSource][previewEVColId ?? evColId].values[paramInfoId];
    }
    return "";
  });
}

export function useGetEVColNames(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const evColIds = useGetSectionInfo(sectionId, "evColIds");
  return useEVCols((x) => {
    if (dbSource in x.x) {
      return evColIds.map((e) => ({ id: e, name: x.x[dbSource][e].name }));
    }
    return [];
  }, _.isEqual);
}
