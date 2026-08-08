export type SettaFilesLocation = "auto" | "local" | "global";
type ResolvedSettaFilesLocation = "local" | "global";

export function normalizeSettaFilesLocation(
  value: unknown,
): SettaFilesLocation {
  if (typeof value !== "string") {
    return "auto";
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "auto" || trimmed === "local" || trimmed === "global") {
    return trimmed;
  }
  return "auto";
}

export function normalizeResolvedSettaFilesLocation(
  value: unknown,
): ResolvedSettaFilesLocation | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "local" || trimmed === "global") {
    return trimmed;
  }
  return null;
}

export function chooseWorkspaceHistorySettaFilesLocation(params: {
  requested: unknown;
  resolved: unknown;
}): SettaFilesLocation {
  const requested = normalizeSettaFilesLocation(params.requested);
  if (requested === "auto") {
    return "auto";
  }
  const resolved = normalizeResolvedSettaFilesLocation(params.resolved);
  return resolved ?? requested;
}
