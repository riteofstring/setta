import type {
  ApplicationSnapshotV1,
  CaseResultV1,
  ReviewV1,
  RunV1,
} from "../backend/generatedContract";

export const TERMINAL_RUN_STATUSES = new Set<RunV1["status"]>([
  "completed",
  "failed",
  "canceled",
  "interrupted",
]);

export function terminalRuns(snapshot: ApplicationSnapshotV1): RunV1[] {
  return snapshot.runs.filter((run) => TERMINAL_RUN_STATUSES.has(run.status));
}

function firstTwoRunIds(
  runs: ReadonlyArray<RunV1>,
): readonly [string | null, string | null] {
  return [runs[0]?.id ?? null, runs[1]?.id ?? null];
}

export function defaultComparedRunIds(
  snapshot: ApplicationSnapshotV1,
): readonly [string | null, string | null] {
  const completed = snapshot.runs.filter((run) => run.status === "completed");
  if (completed.length < 2) {
    return firstTwoRunIds(terminalRuns(snapshot));
  }
  const first = completed[0]!;
  const sameLaunch = completed.find(
    (run) =>
      run.id !== first.id &&
      run.launchId === first.launchId &&
      run.candidateId !== first.candidateId,
  );
  return [first.id, (sameLaunch ?? completed[1]!).id];
}

export function findRun(
  snapshot: ApplicationSnapshotV1,
  runId: string | null,
): RunV1 | null {
  return snapshot.runs.find((run) => run.id === runId) ?? null;
}

export function findReviewForRunPair(
  snapshot: ApplicationSnapshotV1,
  firstRunId: string | null,
  secondRunId: string | null,
): ReviewV1 | null {
  if (firstRunId === null || secondRunId === null) return null;
  return (
    snapshot.reviews.find(
      (review) =>
        (review.leftRunId === firstRunId &&
          review.rightRunId === secondRunId) ||
        (review.leftRunId === secondRunId && review.rightRunId === firstRunId),
    ) ?? null
  );
}

export function findCaseResult(
  run: RunV1 | null,
  caseId: string | null,
): CaseResultV1 | null {
  return run?.caseResults.find((result) => result.caseId === caseId) ?? null;
}

export function alignedCaseResults(
  left: RunV1 | null,
  right: RunV1 | null,
): Array<{
  caseId: string;
  caseName: string;
  left: CaseResultV1 | null;
  right: CaseResultV1 | null;
  differs: boolean;
}> {
  const ids = new Set<string>();
  for (const result of left?.caseResults ?? []) ids.add(result.caseId);
  for (const result of right?.caseResults ?? []) ids.add(result.caseId);
  return [...ids].map((caseId) => {
    const leftResult = findCaseResult(left, caseId);
    const rightResult = findCaseResult(right, caseId);
    return {
      caseId,
      caseName: leftResult?.caseName ?? rightResult?.caseName ?? caseId,
      differs: caseResultsDiffer(leftResult, rightResult),
      left: leftResult,
      right: rightResult,
    };
  });
}

function caseResultsDiffer(
  left: CaseResultV1 | null,
  right: CaseResultV1 | null,
): boolean {
  if (left === null || right === null || left.status !== right.status) {
    return true;
  }
  return comparisonSignature(left) !== comparisonSignature(right);
}

function comparisonSignature(result: CaseResultV1): string {
  return JSON.stringify({
    artifacts: result.artifacts.map((artifact) => [
      artifact.name,
      artifact.mediaType,
      artifact.byteLength,
      artifact.sha256,
    ]),
    findings: result.findings.map((finding) => [
      finding.checkId,
      finding.status,
      finding.message,
    ]),
    observations: result.observations.map((observation) => [
      observation.id,
      observation.kind,
      observation.numberValue,
      observation.textValue,
      observation.booleanValue,
    ]),
    output: result.output,
  });
}

export function reconciledId(
  candidate: string | null,
  available: ReadonlySet<string>,
  fallback: string | null,
): string | null {
  return candidate !== null && available.has(candidate) ? candidate : fallback;
}
