import { ListenerDependencyKey } from "utils/generatedTypes";
import {
  ListenerCoverageRecord,
  ListenerCoverageStatus,
  useListenerCoverage,
} from "state/definitions";

export type ListenerCoverageSnapshotInput = {
  projectConfigId: string;
  revision: number;
  dependencies: Array<ListenerDependencyKey>;
  hasRealtimeWildcard: boolean;
};

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

function initializeRecord(status: ListenerCoverageStatus): ListenerCoverageRecord {
  return {
    revision: null,
    status,
    hasRealtimeWildcard: false,
    dependenciesByKey: {},
  };
}

export function setListenerCoverageStatus(
  projectConfigId: string,
  status: ListenerCoverageStatus,
): void {
  useListenerCoverage.setState((state) => {
    const current = state.byProjectId[projectConfigId];
    if (current) {
      current.status = status;
      if (status === "unknown") {
        current.revision = null;
        current.hasRealtimeWildcard = false;
        current.dependenciesByKey = {};
      }
    } else {
      state.byProjectId[projectConfigId] = initializeRecord(status);
    }
  });
}

export function applyListenerCoverageSnapshot({
  projectConfigId,
  revision,
  dependencies,
  hasRealtimeWildcard,
}: ListenerCoverageSnapshotInput): void {
  useListenerCoverage.setState((state) => {
    const current = state.byProjectId[projectConfigId];
    const dependencyLookup = buildDependencyLookup(dependencies);

    if (current) {
      const sameRevision =
        current.revision === revision &&
        current.hasRealtimeWildcard === hasRealtimeWildcard &&
        Object.keys(current.dependenciesByKey).length ===
          Object.keys(dependencyLookup).length &&
        Object.keys(dependencyLookup).every(
          (key) => current.dependenciesByKey[key] !== undefined,
        );
      if (sameRevision && current.status === "ready") {
        return;
      }
      current.revision = revision;
      current.status = "ready";
      current.hasRealtimeWildcard = hasRealtimeWildcard;
      current.dependenciesByKey = dependencyLookup;
      return;
    }

    state.byProjectId[projectConfigId] = {
      revision,
      status: "ready",
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
  if (!record || record.status !== "ready") {
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
