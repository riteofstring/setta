import _ from "lodash";
import { useParamInfos } from "state/definitions/paramInfos";
import {
  useGetSectionInfo,
  useMappedSectionDBSource,
} from "./useGetSectionInfo";

export function useGetParamEnteredValue(
  sectionId: string,
  paramInfoId: string,
) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const evColId = useGetSectionInfo(sectionId, "evColId");
  const previewEVColId = useGetSectionInfo(sectionId, "previewEVColId");

  // console.log("dbSource", dbSource);
  // console.log("evColId", evColId);
  // console.log("previewEVColId", previewEVColId);

  return useParamInfos((x) => {
    if (dbSource in x.x) {
      return x.x[dbSource][previewEVColId ?? evColId].values[paramInfoId];
    }
    return "";
  });
}

export function useGetEVColNames(sectionId: string) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const evColIds = useGetSectionInfo(sectionId, "evColIds");
  return useParamInfos((x) => {
    if (dbSource in x.x) {
      return evColIds.map((e) => ({ id: e, name: x.x[dbSource][e].name }));
    }
    return [];
  }, _.isEqual);
}
