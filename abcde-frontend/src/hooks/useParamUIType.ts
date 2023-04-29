import { CodeInfoType } from "abcde-utils/src/types/codeInfo";
import { UITypeTypeWithId } from "abcde-utils/src/types/uiType";
import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "utils/constants";
import { useGetSectionConfig } from "./useSectionConfig";

export function useGetParamUIType(
  sectionId: string,
  paramInfoId: string
): UITypeTypeWithId {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  const uiType = useUITypes((x) => x.x[uiTypeId], _.isEqual);
  return { id: uiTypeId, ...uiType };
}

export function useParamUITypeId(sectionId: string, paramInfoId: string) {
  const uiTypeColId = useGetSectionConfig(sectionId, "uiTypeColId");
  return useParamInfos((x) => x.y[uiTypeColId][paramInfoId]);
}

export function useGetManyParamUITypeIds(
  sectionId: string,
  paramInfos: string[] | CodeInfoType[],
  inputsAreIds: boolean
) {
  const uiTypeColId = useGetSectionConfig(sectionId, "uiTypeColId");
  return useParamInfos(
    (x) => paramInfos.map((p) => x.y[uiTypeColId][inputsAreIds ? p : p.id]),
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
