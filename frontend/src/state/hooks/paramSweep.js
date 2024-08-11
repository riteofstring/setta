import _ from "lodash";
import { useParamSweep, useSectionInfos } from "state/definitions";
import { useGetSectionInfo } from "./sections";

export function useParamSweepInfo(sectionId) {
  const forSectionId = useForSectionId(sectionId);
  const paramSweepId = useSectionInfos((x) =>
    forSectionId ? x.x[forSectionId].paramSweepId : null,
  );
  const previewParamSweepId = useSectionInfos((x) =>
    forSectionId ? x.x[forSectionId].previewParamSweepId : null,
  );
  const paramSweep = useParamSweep(
    (x) => x.x[previewParamSweepId ?? paramSweepId].sweep,
  );
  const codeInfoId = useGetSectionInfo(forSectionId, "codeInfoId");
  const selectedItem = useGetSectionInfo(forSectionId, "selectedItem");
  return {
    paramSweepId,
    paramSweep,
    forSectionId,
    codeInfoId: selectedItem ?? codeInfoId,
  };
}

export function useSectionHasMultipleParamSweeps(sectionId) {
  const forSectionId = useForSectionId(sectionId);
  return useSectionInfos(
    (x) => forSectionId && x.x[forSectionId].paramSweepIds.length > 1,
  );
}

export function useGetParamSweepNames(sectionId) {
  const paramSweepIds = useSectionInfos((x) => x.x[sectionId].paramSweepIds);
  return useParamSweep(
    (x) => paramSweepIds.map((e) => ({ id: e, name: x.x[e].name })),
    _.isEqual,
  );
}

export function useCurrParamSweepId(sectionId) {
  const forSectionId = useForSectionId(sectionId);
  return useSectionInfos((x) => x.x[forSectionId].paramSweepId);
}

export function useForSectionId(sectionId) {
  return useSectionInfos((x) => getForSectionId(x.x, sectionId));
}

export function getForSectionId(state, sectionId) {
  return Object.values(state).find((s) => s.paramSweepSectionId === sectionId)
    ?.id;
}
