import { requiresNestedSection } from "abcde-utils/src/constants";
import { CodeInfoType } from "abcde-utils/src/types/codeInfo";
import { UITypeColType } from "abcde-utils/src/types/uiTypeCol";
import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
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

export function useAreAllParamsNested(
  sectionId: string,
  paramInfos: CodeInfoType[]
) {
  const uiTypeIds = useGetManyParamUITypeIds(sectionId, paramInfos, false);
  return useUITypes((x) =>
    uiTypeIds.map((y) => requiresNestedSection(x.x[y].type)).every((z) => z)
  );
}
