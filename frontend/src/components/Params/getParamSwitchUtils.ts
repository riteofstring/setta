import { isTempParam } from "forks/dnd-kit/paramDndState";
import { matchSorter } from "match-sorter";

type RequiredParamIdsToPaths = Record<string, string[]>;

type BuildFilteredRequiredParamSetArgs = {
  paramFilter: string;
  requiredParamIdsToPaths: RequiredParamIdsToPaths;
  getParamName: (paramId: string) => string;
};

type RequiredParamEntry = {
  id: string;
  name: string;
};

export function buildFilteredRequiredParamSet({
  paramFilter,
  requiredParamIdsToPaths,
  getParamName,
}: BuildFilteredRequiredParamSetArgs): ReadonlySet<string> | null {
  const trimmedParamFilter = paramFilter.trim();
  if (trimmedParamFilter.length === 0) {
    return null;
  }
  const requiredParamEntries: RequiredParamEntry[] = Object.keys(
    requiredParamIdsToPaths,
  ).map((paramId) => ({
    id: paramId,
    name: getParamName(paramId),
  }));
  const matchedEntries = matchSorter(requiredParamEntries, trimmedParamFilter, {
    keys: ["name"],
  });

  const filteredRequiredParamIds = new Set<string>();
  for (const entry of matchedEntries) {
    const paramPath = requiredParamIdsToPaths[entry.id];
    if (!paramPath) {
      continue;
    }
    for (const pathParamId of paramPath) {
      filteredRequiredParamIds.add(pathParamId);
    }
  }
  return filteredRequiredParamIds;
}

export function filterParamIdsForRender(
  paramIds: Array<string>,
  filteredRequiredParamIds: ReadonlySet<string> | null,
): Array<string> {
  if (!filteredRequiredParamIds) {
    return paramIds;
  }
  return paramIds.filter(
    (paramId) =>
      filteredRequiredParamIds.has(paramId) || isTempParam(paramId),
  );
}
