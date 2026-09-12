import type {
  ArtifactReferenceV1,
  CaseResultV1,
  FindingV1,
  RunV1,
} from "../backend/generatedContract";

export function formatBytes(value: number): string {
  if (value < 1_000) return `${String(value)} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

export function formatDuration(value: number | null): string {
  if (value === null) return "—";
  if (value < 1_000) return `${String(Math.round(value))} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}

export function formatTimestamp(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function runDuration(run: RunV1): number | null {
  const durations = run.caseResults
    .map((result) => result.durationMilliseconds)
    .filter((value): value is number => value !== null);
  return durations.length === 0
    ? null
    : durations.reduce((sum, value) => sum + value, 0);
}

export function runProgress(run: RunV1): string {
  const terminal = run.caseResults.filter(
    (result) => result.status !== "queued" && result.status !== "running",
  ).length;
  return `${String(terminal)} / ${String(run.caseResults.length)}`;
}

export function failedFindingCount(run: RunV1): number {
  return run.caseResults.reduce(
    (total, result) =>
      total +
      result.findings.filter((finding) => finding.status === "failed").length,
    0,
  );
}

export function medianArtifactBytes(run: RunV1): number | null {
  const values = run.caseResults
    .flatMap((result) => result.artifacts)
    .map((artifact) => artifact.byteLength)
    .sort((left, right) => left - right);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  const upper = values[middle]!;
  return values.length % 2 === 1
    ? upper
    : Math.round((values[middle - 1]! + upper) / 2);
}

export function primaryArtifact(
  result: CaseResultV1 | null,
): ArtifactReferenceV1 | null {
  return (
    result?.artifacts.find((artifact) =>
      artifact.mediaType.startsWith("image/"),
    ) ??
    result?.artifacts[0] ??
    null
  );
}

export function findingLabel(finding: FindingV1): string {
  return finding.status === "passed" ? "Passed" : "Failed";
}
