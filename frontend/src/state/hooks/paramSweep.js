import _ from "lodash";
import { useParamSweep, useSectionInfos } from "state/definitions";

export function useParamSweepInfo(sectionId) {
  const forSectionId = useForSectionId(sectionId);
  const paramSweepId = useSectionInfos((x) =>
    forSectionId ? x.x[forSectionId].paramSweepId : null,
  );
  const previewParamSweepId = useSectionInfos((x) =>
    forSectionId ? x.x[forSectionId].previewParamSweepId : null,
  );

  const shownParamSweepId = previewParamSweepId ?? paramSweepId;
  const paramSweep = useParamSweep((x) => x.x[shownParamSweepId], _.isEqual);

  return {
    paramSweepId: shownParamSweepId,
    paramSweep: paramSweep.sweep,
    forSectionId,
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

export function getParamSweep(forSectionId) {
  const { paramSweepId } = useSectionInfos.getState().x[forSectionId];
  if (!paramSweepId) {
    return null;
  }
  return useParamSweep.getState().x[paramSweepId].sweep;
}
