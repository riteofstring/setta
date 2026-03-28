import { isTempParam } from "forks/dnd-kit/paramDndState";
import { matchSorter } from "match-sorter";

type ResolveVisibleParamIdsArgs = {
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  paramFilter: string;
  getParamDisplayName: (paramId: string) => string;
};

type RequiredParamMatch = {
  id: string;
  name: string;
};

export function resolveVisibleParamIds({
  paramIds,
  requiredParamIdsToPaths,
  paramFilter,
  getParamDisplayName,
}: ResolveVisibleParamIdsArgs): string[] {
  const visibleParamIds = new Set<string>();
  for (const paramId of getMatchedRequiredParamIds({
    paramIds,
    requiredParamIdsToPaths,
    paramFilter,
    getParamDisplayName,
  })) {
    const path = requiredParamIdsToPaths[paramId];
    if (!path) {
      continue;
    }
    for (const pathPart of path) {
      visibleParamIds.add(pathPart);
    }
  }

  return paramIds.filter(
    (paramId) => visibleParamIds.has(paramId) || isTempParam(paramId),
  );
}

function getMatchedRequiredParamIds({
  paramIds,
  requiredParamIdsToPaths,
  paramFilter,
  getParamDisplayName,
}: ResolveVisibleParamIdsArgs): string[] {
  if (!paramFilter) {
    return paramIds;
  }

  return matchSorter(
    Object.keys(requiredParamIdsToPaths).map(
      (id): RequiredParamMatch => ({
        id,
        name: getParamDisplayName(id),
      }),
    ),
    paramFilter,
    {
      keys: ["name"],
    },
  ).map((match) => match.id);
}
