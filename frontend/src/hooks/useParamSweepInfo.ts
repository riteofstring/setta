import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useParamSweep } from "models/paramSweep";
import { useGetSectionInfo } from "./useSectionInfo";

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
  return { paramSweepId, paramSweep, forSectionId };
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
