import {
  NULL_PROJECT_CONFIG_ID,
  useListenerCoverage,
  type ListenerCoverageRecord,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_listener_coverage } from "utils/generatedEndpoints";
import {
  ListenerCoverageSnapshot,
  ListenerDependencyKey,
} from "utils/generatedTypes";

function serializeListenerDependencyKey(key: ListenerDependencyKey): string {
  return key.codeObjId
    ? `${key.sectionId}::${key.codeObjId}`
    : `${key.sectionId}::`;
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
    const dependencyLookup = buildDependencyLookup(dependencies);
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

export function serializeCoverageKey(
  dependency: ListenerDependencyKey,
): string {
  return serializeListenerDependencyKey(dependency);
}

export async function fetchListenerCoverageSnapshot(
  projectConfigId: string,
): Promise<void> {
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  console.log("fetchListenerCoverageSnapshot");
  const res = await route_get_listener_coverage({ projectConfigId });
  console.log("res", res);
  if (!res200(res)) {
    return;
  }
  applyListenerCoverageSnapshot(res.data);
}
