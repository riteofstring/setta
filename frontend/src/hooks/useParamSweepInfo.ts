import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useParamSweep } from "models/paramSweep";
import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useParamSweepInfo(sectionId) {
  const forSectionId = useSectionInfos(
    (x) =>
      Object.values(x.x).find((s) => s.paramSweepSectionId === sectionId)?.id
  );
  const paramSweepId = useSectionInfos((x) =>
    forSectionId ? x.x[forSectionId].paramSweepId : null
  );
  const paramSweep = useParamSweep((x) =>
    paramSweepId ? x.x[paramSweepId].sweep : null
  );
  const codeInfoId = useGetSectionTypeConfig(forSectionId, "codeInfoId");
  const selectedItem = useGetSectionInfo(forSectionId, "selectedItem");
  return {
    paramSweepId,
    paramSweep,
    forSectionId,
    codeInfoId: selectedItem ?? codeInfoId,
  };
}

export function useSectionHasMultipleParamSweeps(sectionId) {
  return useSectionInfos((x) => x.x[sectionId].paramSweepIds.length > 1);
}

export function useGetParamSweepNames(sectionId: string) {
  const paramSweepIds = useGetSectionInfo(sectionId, "paramSweepIds");
  return useParamSweep(
    (x) => paramSweepIds.map((e) => ({ id: e, name: x.x[e].name })),
    _.isEqual
  );
}
