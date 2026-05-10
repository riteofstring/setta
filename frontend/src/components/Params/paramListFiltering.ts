import { isTempParam } from "forks/dnd-kit/paramDndState";
import { matchSorter } from "match-sorter";
import { getParamDisplayNameIfPresent } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";

export type FilteredParamRows = {
  readonly paramIds: string[];
  readonly requiredParamIdsToPaths: Record<string, string[]>;
};

export function resolveFilteredParamRows({
  paramFilter,
  paramIds,
  requiredParamIdsToPaths,
  sectionId,
  state,
}: {
  readonly paramFilter: string | null | undefined;
  readonly paramIds: readonly string[];
  readonly requiredParamIdsToPaths: Readonly<Record<string, readonly string[]>>;
  readonly sectionId: string;
  readonly state: ZustandProjectState;
}): FilteredParamRows {
  if (!paramFilter) {
    return {
      paramIds: [...paramIds],
      requiredParamIdsToPaths: copyRequiredParamIdsToPaths(
        requiredParamIdsToPaths,
      ),
    };
  }

  let matches: readonly (string | { readonly id: string })[] = paramIds;

  const requiredParamIdsWithNames = Object.keys(requiredParamIdsToPaths).map(
    (id) => ({
      id,
      name: getParamDisplayNameIfPresent(state, sectionId, id) ?? id,
    }),
  );

  matches = matchSorter(requiredParamIdsWithNames, paramFilter, {
    keys: ["name"],
  });

  const filteredRequired = new Set<string>();
  for (const match of matches) {
    const paramId = typeof match === "string" ? match : match.id;
    const path = requiredParamIdsToPaths[paramId];
    if (!path) {
      continue;
    }
    for (const pathPart of path) {
      filteredRequired.add(pathPart);
    }
  }

  return {
    paramIds: paramIds.filter(
      (paramId) => filteredRequired.has(paramId) || isTempParam(paramId),
    ),
    requiredParamIdsToPaths: copyRequiredParamIdsToPaths(
      Object.entries(requiredParamIdsToPaths).filter(([paramId]) =>
        filteredRequired.has(paramId),
      ),
    ),
  };
}

function copyRequiredParamIdsToPaths(
  entries:
    | Readonly<Record<string, readonly string[]>>
    | readonly (readonly [string, readonly string[]])[],
): Record<string, string[]> {
  return Object.fromEntries(
    Array.isArray(entries)
      ? entries.map(([paramId, path]) => [paramId, [...path]])
      : Object.entries(entries).map(([paramId, path]) => [paramId, [...path]]),
  );
}
