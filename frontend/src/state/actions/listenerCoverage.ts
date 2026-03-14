import {
  NULL_PROJECT_CONFIG_ID,
  useListenerCoverage,
  type ListenerCoverageRecord,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_listener_coverage } from "utils/generatedEndpoints";
import {
  BaseDependencyKeyUnion,
  DependencyKeyTypeEnum,
  ListenerCoverageSnapshot,
} from "utils/generatedTypes";

function serializeListenerDependencyKey(key: BaseDependencyKeyUnion): string {
  switch (key.type) {
    case DependencyKeyTypeEnum.Section:
      return `${key.sectionId}::`;
    case DependencyKeyTypeEnum.SectionParam:
      return `${key.sectionId}::${key.codeObjId}`;
    default:
      return key satisfies never;
  }
}

function buildDependencyLookup(
  dependencies: Array<BaseDependencyKeyUnion>,
): Record<string, BaseDependencyKeyUnion> {
  const lookup: Record<string, BaseDependencyKeyUnion> = {};
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
  dependency: BaseDependencyKeyUnion,
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

export async function fetchListenerCoverageSnapshot(
  projectConfigId: string,
): Promise<void> {
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const res = await route_get_listener_coverage({ projectConfigId });
  if (!res200(res)) {
    return;
  }
  applyListenerCoverageSnapshot(res.data);
}
