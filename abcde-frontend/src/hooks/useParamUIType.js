import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { requiresNestedSection } from "utils/constants";
import { defaultState } from "utils/utils";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useGetParamUIType(sectionId, paramInfoId) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return defaultState(
    useStoreState((x) => x.uiTypes.x[uiTypeId]),
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
  return useStoreState((x) =>
    uiTypeIds
      .map((y) => requiresNestedSection(x.uiTypes.x[y]?.type))
      .every((z) => z)
  );
}
