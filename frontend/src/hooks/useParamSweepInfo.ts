import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useParamSweep } from "models/paramSweep";
import { useGetSectionInfo } from "./useSectionInfo";

export function useParamSweepInfo(sectionId) {
  const paramSweepId = useSectionInfos((x) => x.x[sectionId].paramSweepId);
  const paramSweep = useParamSweep((x) => x.x[paramSweepId].sweep);
  return { paramSweepId, paramSweep };
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
