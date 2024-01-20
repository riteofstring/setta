import { useParamSweep } from "models/paramSweep";
import { useGetSectionInfo } from "./useSectionInfo";

export function useSectionParamSweep(sectionId: string) {
  const paramSweepId = useGetSectionInfo(sectionId, "paramSweepId");
  return useParamSweep((x) => (paramSweepId ? x.x[paramSweepId] : []));
}
