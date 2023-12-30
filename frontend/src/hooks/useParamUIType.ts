import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { CodeInfoType } from "z_utils/types/codeInfo";
import { UITypeColType } from "z_utils/types/uiTypeCol";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetParamUIType(sectionId: string, paramInfoId: string) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return useUITypes((x) => x.x[uiTypeId], _.isEqual);
}

function useUITypeCol<K extends keyof UITypeColType["codeInfoId"]>(
  sectionId: string,
  paramInfoId: string,
  key: K
) {
  const uiTypeColId = useGetSectionInfo(sectionId, "uiTypeColId");
  return useParamInfos((x) => x.y[uiTypeColId][paramInfoId][key]);
}

export function useParamUITypeId(sectionId: string, paramInfoId: string) {
  return useUITypeCol(sectionId, paramInfoId, "uiTypeId");
}

export function useParamNonPresetUITypeIds(
  sectionId: string,
  paramInfoId: string
) {
  return useUITypeCol(sectionId, paramInfoId, "nonPresetUITypeIds");
}

export function useGetManyParamUITypeIds(
  sectionId: string,
  paramInfos: (string | CodeInfoType | null)[],
  inputsAreIds: boolean
) {
  const uiTypeColId = useGetSectionInfo(sectionId, "uiTypeColId");
  return useParamInfos(
    (x) =>
      paramInfos.map((p) =>
        p ? x.y[uiTypeColId][inputsAreIds ? p : p.id].uiTypeId : undefined
      ),
    _.isEqual
  );
}
