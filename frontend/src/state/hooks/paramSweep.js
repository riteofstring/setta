import _ from "lodash";
import { useParamSweep, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";

export function useParamSweepInfo(sectionId) {
  const { forSectionId, paramSweepId, previewParamSweepId } = useSectionInfos(
    (x) => {
      const forSectionId = getForSectionId(x.x, sectionId);
      if (forSectionId) {
        return {
          forSectionId,
          paramSweepId: x.sectionConfigs[forSectionId].paramSweepId,
          previewParamSweepId: x.sectionConfigs[forSectionId].previewParamSweepId,
        };
      }
      return { forSectionId, paramSweepId: null, previewParamSweepId: null };
    },
  );

  const shownParamSweepId = previewParamSweepId ?? paramSweepId;
  const paramSweep = useParamSweep((x) => x.x[shownParamSweepId], _.isEqual);

  return {
    paramSweepId: shownParamSweepId,
    paramSweep: paramSweep.sweep,
    forSectionId,
  };
}

export function useGetParamSweepNames(sectionId) {
  const paramSweepIds = useSectionInfos((x) => x.x[sectionId].paramSweepIds);
  return useParamSweep(
    (x) => paramSweepIds.map((e) => ({ id: e, name: x.x[e].name })),
    _.isEqual,
  );
}

export function useCurrParamSweepId(sectionId) {
  return useSectionInfos(
    (x) => x.x[getForSectionId(x.x, sectionId)].paramSweepId,
  );
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

export function duplicateParamSweep({ id, newName }) {
  const newId = createNewId();
  useParamSweep.setState((state) => {
    const s = state.x;
    s[newId] = _.cloneDeep(s[id]);
    s[newId].name = newName;
    s[newId].isFrozen = false;
  });
  return newId;
}

export function useParamSweepIsFrozen(sectionId) {
  const paramSweepId = useCurrParamSweepId(sectionId);
  return useParamSweep((x) => x.x[paramSweepId].isFrozen);
}
