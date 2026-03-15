import { isTempParam } from "forks/dnd-kit/paramDndState";
import { matchSorter } from "match-sorter";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

type GetFilteredRenderableParamIdsArgs = {
  state: ZustandProjectState;
  sectionId: string;
  renderParamIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
};

export function getFilteredRenderableParamIds({
  state,
  sectionId,
  renderParamIds,
  requiredParamIdsToPaths,
}: GetFilteredRenderableParamIdsArgs) {
  const paramsImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );

  if (!paramsImpl.paramFilter) {
    return renderParamIds;
  }

  const requiredParamIdsWithNames = Object.keys(requiredParamIdsToPaths).map(
    (id) => ({
      id,
      name: getParamDisplayName(state, sectionId, id),
    }),
  );
  const matches = matchSorter(requiredParamIdsWithNames, paramsImpl.paramFilter, {
    keys: ["name"],
  });

  const filteredRequired = new Set<string>();
  for (const match of matches) {
    const path = requiredParamIdsToPaths[match.id];
    if (!path) {
      continue;
    }
    for (const pathPart of path) {
      filteredRequired.add(pathPart);
    }
  }

  return renderParamIds.filter(
    (paramId) => filteredRequired.has(paramId) || isTempParam(paramId),
  );
}
