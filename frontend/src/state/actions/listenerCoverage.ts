import {
  NULL_PROJECT_CONFIG_ID,
  useListenerCoverage,
  type ListenerCoverageRecord,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_listener_coverage } from "utils/generatedEndpoints";
import {
  DependencyKey,
  DependencyKeyTypeEnum,
  ListenerCoverageSnapshot,
} from "utils/generatedTypes";

function serializeListenerDependencyKey(key: DependencyKey): string {
  switch (key.type) {
    case DependencyKeyTypeEnum.Section:
      return `${key.sectionId}::`;
    case DependencyKeyTypeEnum.SectionParam:
      return `${key.sectionId}::${key.codeObjId}`;
    default:
      return key.type satisfies never;
  }
}

function buildDependencyLookup(
  dependencies: Array<DependencyKey>,
): Record<string, DependencyKey> {
  const lookup: Record<string, DependencyKey> = {};
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
  dependency: DependencyKey,
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

export function serializeCoverageKey(dependency: DependencyKey): string {
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
