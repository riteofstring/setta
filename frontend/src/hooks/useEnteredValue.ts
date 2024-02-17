import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetParamEnteredValue(
  sectionId: string,
  paramInfoId: string,
) {
  const evColId = useGetSectionInfo(sectionId, "evColId");
  const previewEVColId = useGetSectionInfo(sectionId, "previewEVColId");
  return useParamInfos((x) => x.x[previewEVColId ?? evColId].values[paramInfoId]);
}

export function useGetEVColNames(sectionId: string) {
  const evColIds = useGetSectionInfo(sectionId, "evColIds");
  return useParamInfos(
    (x) => evColIds.map((e) => ({ id: e, name: x.x[e].name })),
    _.isEqual,
  );
}
