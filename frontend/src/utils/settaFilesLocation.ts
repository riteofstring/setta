import { SettaFilesLocationPolicyConfig } from "utils/generatedTypes";

if (
  !SettaFilesLocationPolicyConfig.requested ||
  SettaFilesLocationPolicyConfig.requested.length === 0
) {
  throw new Error(
    "SettaFilesLocationPolicyConfig.requested must include at least one location.",
  );
}
const resolvedSettaFilesLocations =
  SettaFilesLocationPolicyConfig.resolved ?? [];
const requestedSettaFilesLocationSet = new Set<string>(
  SettaFilesLocationPolicyConfig.requested,
);
const resolvedSettaFilesLocationSet = new Set<string>(
  resolvedSettaFilesLocations,
);
const defaultSettaFilesLocation = SettaFilesLocationPolicyConfig.requested[0];

export type SettaFilesLocation =
  (typeof SettaFilesLocationPolicyConfig.requested)[number];
type ResolvedSettaFilesLocation = (typeof resolvedSettaFilesLocations)[number];

export function normalizeSettaFilesLocation(
  value: unknown,
): SettaFilesLocation {
  if (typeof value !== "string") {
    return defaultSettaFilesLocation;
  }
  const trimmed = value.trim().toLowerCase();
  if (requestedSettaFilesLocationSet.has(trimmed)) {
    return trimmed as SettaFilesLocation;
  }
  return defaultSettaFilesLocation;
}

function normalizeResolvedSettaFilesLocation(
  value: unknown,
): ResolvedSettaFilesLocation | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (resolvedSettaFilesLocationSet.has(trimmed)) {
    return trimmed as ResolvedSettaFilesLocation;
  }
  return null;
}

export function chooseWorkspaceHistorySettaFilesLocation(params: {
  requested: unknown;
  resolved: unknown;
}): SettaFilesLocation {
  const requested = normalizeSettaFilesLocation(params.requested);
  if (requested === defaultSettaFilesLocation) {
    return defaultSettaFilesLocation;
  }
  const resolved = normalizeResolvedSettaFilesLocation(params.resolved);
  return resolved ?? requested;
}
