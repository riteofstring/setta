import { CodeInfoType } from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "utils/constants";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetParamUIType(sectionId: string, paramInfoId: string) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return useUITypes((x) => x.x[uiTypeId], _.isEqual);
}

export function useParamUITypeId(sectionId: string, paramInfoId: string) {
  const uiTypeColId = useGetSectionInfo(sectionId, "uiTypeColId");
  return useParamInfos((x) => x.y[uiTypeColId][paramInfoId].uiTypeId);
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
