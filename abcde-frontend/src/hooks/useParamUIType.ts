import { CodeInfoType } from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "utils/constants";
import { useGetSectionConfig } from "./useSectionConfig";

export function useGetParamUIType(sectionId: string, paramInfoId: string) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return useUITypes((x) => x.x[uiTypeId], _.isEqual);
}

export function useParamUITypeId(sectionId: string, paramInfoId: string) {
  const uiTypeColId = useGetSectionConfig(sectionId, "uiTypeColId");
  return useParamInfos((x) => x.y[uiTypeColId][paramInfoId]);
}

export function useGetManyParamUITypeIds(
  sectionId: string,
  paramInfos: CodeInfoType[]
) {
  const uiTypeColId = useGetSectionConfig(sectionId, "uiTypeColId");
  return useParamInfos(
    (x) => paramInfos.map((y) => x.y[uiTypeColId][y.id]),
    _.isEqual
  );
}

export function useAreAllParamsNested(
  sectionId: string,
  paramInfos: CodeInfoType[]
) {
  const uiTypeIds = useGetManyParamUITypeIds(sectionId, paramInfos);
  return useUITypes((x) =>
    uiTypeIds.map((y) => requiresNestedSection(x.x[y].type)).every((z) => z)
  );
}
