import { ListenerCoverageSnapshot, ListenerDependencyKey } from "utils/generatedTypes";
import { type ListenerCoverageRecord, useListenerCoverage } from "state/definitions";

function serializeListenerDependencyKey(key: ListenerDependencyKey): string {
  return key.codeObjId ? `${key.sectionId}::${key.codeObjId}` : `${key.sectionId}::`;
}

function buildDependencyLookup(
  dependencies: Array<ListenerDependencyKey>,
): Record<string, ListenerDependencyKey> {
  const lookup: Record<string, ListenerDependencyKey> = {};
  for (const dependency of dependencies) {
    lookup[serializeListenerDependencyKey(dependency)] = dependency;
  }
  return lookup;
}

export function applyListenerCoverageSnapshot(
  snapshot: ListenerCoverageSnapshot,
): void {
  useListenerCoverage.setState((state) => {
    const { projectConfigId, dependencies, hasRealtimeWildcard } = snapshot;
    const current = state.byProjectId[projectConfigId];
    const dependencyLookup = buildDependencyLookup(dependencies);

    if (current) {
      const matchesExisting =
        current.hasRealtimeWildcard === hasRealtimeWildcard &&
        Object.keys(current.dependenciesByKey).length ===
          Object.keys(dependencyLookup).length &&
        Object.keys(dependencyLookup).every(
          (key) => current.dependenciesByKey[key] !== undefined,
        );
      if (matchesExisting) {
        return;
      }
      current.hasRealtimeWildcard = hasRealtimeWildcard;
      current.dependenciesByKey = dependencyLookup;
      return;
    }

    state.byProjectId[projectConfigId] = {
      hasRealtimeWildcard,
      dependenciesByKey: dependencyLookup,
    };
  });
}

export function getListenerCoverageRecord(
  projectConfigId: string,
): ListenerCoverageRecord | undefined {
  return useListenerCoverage.getState().byProjectId[projectConfigId];
}

export function dependencyKeyCovered(
  projectConfigId: string,
  dependency: ListenerDependencyKey,
): boolean {
  const record = getListenerCoverageRecord(projectConfigId);
  if (!record) {
    return false;
  }
  if (record.hasRealtimeWildcard) {
    return true;
  }
  const lookupKey = serializeListenerDependencyKey(dependency);
  return record.dependenciesByKey[lookupKey] !== undefined;
}

export function serializeCoverageKey(dependency: ListenerDependencyKey): string {
  return serializeListenerDependencyKey(dependency);
}
