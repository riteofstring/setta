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

  return useParamInfos(
    (x) => x.x[dbSource][previewEVColId ?? evColId].values[paramInfoId],
  );
}

export function useGetEVColNames(sectionId: string) {
  const dbSource = useSectionDBSource(sectionId);
  const evColIds = useGetSectionInfo(sectionId, "evColIds");
  return useParamInfos(
    (x) => evColIds.map((e) => ({ id: e, name: x.x[dbSource][e].name })),
    _.isEqual,
  );
}
