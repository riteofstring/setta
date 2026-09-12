type BenchSectionData = {
  entityId: string;
};

export function readBenchSectionData(value: unknown): BenchSectionData {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1
  ) {
    throw new Error("Bench section data must contain one entity identity.");
  }
  const entityId = (value as { entityId?: unknown }).entityId;
  if (
    typeof entityId !== "string" ||
    entityId.trim() === "" ||
    entityId !== entityId.trim()
  ) {
    throw new Error("Bench section entity identity must be nonblank.");
  }
  return { entityId };
}
