import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "utils/constants";
import { defaultState } from "utils/utils";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useGetParamUIType(sectionId, paramInfoId) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return defaultState(
    useUITypes((x) => x.x[uiTypeId]),
    () => ({})
  );
}

export function useParamUITypeId(sectionId, paramInfoId) {
  const [uiTypeColId] = useGetSectionTypeConfig(sectionId, ["uiTypeColId"]);
  return useParamInfos((x) => x.y[uiTypeColId]?.[paramInfoId]);
}

export function useGetManyParamUITypeIds(sectionId, paramInfos) {
  const [uiTypeColId] = useGetSectionTypeConfig(sectionId, ["uiTypeColId"]);
  return useParamInfos(
    (x) => paramInfos.map((y) => x.y[uiTypeColId]?.[y.id]),
    _.isEqual
  );
}

export function useAreAllParamsNested(sectionId, paramInfos) {
  const uiTypeIds = useGetManyParamUITypeIds(sectionId, paramInfos);
  return useUITypes((x) =>
    uiTypeIds.map((y) => requiresNestedSection(x.x[y]?.type)).every((z) => z)
  );
}
