import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useGetSectionInfo, useSectionDBSource } from "./useSectionInfo";

export function useGetParamEnteredValue(
  sectionId: string,
  paramInfoId: string,
) {
  const dbSource = useSectionDBSource(sectionId);
  const evColId = useGetSectionInfo(sectionId, "evColId");
  const previewEVColId = useGetSectionInfo(sectionId, "previewEVColId");

  console.log("dbSource", dbSource);
  console.log("evColId", evColId);
  console.log("previewEVColId", previewEVColId);

  return useParamInfos((x) => {
    if (dbSource in x.x) {
      return x.x[dbSource][previewEVColId ?? evColId].values[paramInfoId];
    }
    return "";
  });
}

export function useGetEVColNames(sectionId: string) {
  const dbSource = useSectionDBSource(sectionId);
  const evColIds = useGetSectionInfo(sectionId, "evColIds");
  return useParamInfos((x) => {
    if (dbSource in x.x) {
      return evColIds.map((e) => ({ id: e, name: x.x[dbSource][e].name }));
    }
    return [];
  }, _.isEqual);
}
