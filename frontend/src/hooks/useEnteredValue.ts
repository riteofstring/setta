import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetParamEnteredValue(
  sectionId: string,
  paramInfoId: string,
) {
  const evColId = useGetSectionInfo(sectionId, "evColId");
  return useParamInfos((x) => x.x[evColId].values[paramInfoId]);
}

export function useGetEVColNames(sectionId: string) {
  const evColIds = useGetSectionInfo(sectionId, "evColIds");
  return useParamInfos(
    (x) => evColIds.map((e) => ({ id: e, name: x.x[e].name })),
    _.isEqual,
  );
}
