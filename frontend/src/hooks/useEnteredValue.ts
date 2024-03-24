import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetParamEnteredValue(
  sectionId: string,
  paramInfoId: string,
) {
  const dbSource = useGetSectionInfo(sectionId, "dbSource");
  const evColId = useGetSectionInfo(sectionId, "evColId");
  const previewEVColId = useGetSectionInfo(sectionId, "previewEVColId");
  return useParamInfos(
    (x) => x.x[dbSource][previewEVColId ?? evColId].values[paramInfoId],
  );
}

export function useGetEVColNames(sectionId: string) {
  const dbSource = useGetSectionInfo(sectionId, "dbSource");
  const evColIds = useGetSectionInfo(sectionId, "evColIds");
  return useParamInfos(
    (x) => evColIds.map((e) => ({ id: e, name: x.x[dbSource][e].name })),
    _.isEqual,
  );
}
