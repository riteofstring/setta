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

type GetFilteredRenderableParamIdLookupArgs = Omit<
  GetFilteredRenderableParamIdsArgs,
  "renderParamIds"
>;

export type RenderableParamIdLookup = Record<string, true>;
export type NestedParentParamIdLookup = Record<string, true>;

export function getNestedParentParamIdLookup(
  requiredParamIdsToPaths: Record<string, Array<string>>,
): NestedParentParamIdLookup {
  const nestedParentParamIdLookup: NestedParentParamIdLookup = {};
  for (const path of Object.values(requiredParamIdsToPaths)) {
    for (let idx = 0; idx < path.length - 1; idx += 1) {
      nestedParentParamIdLookup[path[idx]] = true;
    }
  }
  return nestedParentParamIdLookup;
}

export function getFilteredRenderableParamIdLookup({
  state,
  sectionId,
  requiredParamIdsToPaths,
}: GetFilteredRenderableParamIdLookupArgs): RenderableParamIdLookup | null {
  const paramsImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const paramFilter = paramsImpl.paramFilter.trim();

  if (paramFilter.length === 0) {
    return null;
  }

  const requiredParamIdsWithNames = Object.keys(requiredParamIdsToPaths).map(
    (id) => ({
      id,
      name: getParamDisplayName(state, sectionId, id),
    }),
  );
  const matches = matchSorter(requiredParamIdsWithNames, paramFilter, {
    keys: ["name"],
  });

  const filteredRequired: RenderableParamIdLookup = {};
  for (const match of matches) {
    const path = requiredParamIdsToPaths[match.id];
    if (!path) {
      continue;
    }
    for (const pathPart of path) {
      filteredRequired[pathPart] = true;
    }
  }

  return filteredRequired;
}

export function getFilteredRenderableParamIds({
  state,
  sectionId,
  renderParamIds,
  requiredParamIdsToPaths,
}: GetFilteredRenderableParamIdsArgs) {
  const visibleParamIdLookup = getFilteredRenderableParamIdLookup({
    state,
    sectionId,
    requiredParamIdsToPaths,
  });
  if (!visibleParamIdLookup) {
    return renderParamIds;
  }

  return renderParamIds.filter(
    (paramId) => visibleParamIdLookup[paramId] || isTempParam(paramId),
  );
}
