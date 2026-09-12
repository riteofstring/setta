import { NO_WHEEL_CLASS_NAME } from "@setta/workspace";

import { useBench } from "../app/benchContext";
import { findCaseResult, findRun } from "../app/benchSelection";
import { artifactUrl } from "../backend/client";
import type {
  ArtifactReferenceV1,
  CaseResultV1,
  ObservationV1,
  RunV1,
} from "../backend/generatedContract";
import {
  failedFindingCount,
  findingLabel,
  formatBytes,
  formatDuration,
  medianArtifactBytes,
  primaryArtifact,
  runDuration,
} from "./presentation";

export function ComparisonWindow({ side }: { side: "left" | "right" }) {
  const { selection, snapshot } = useBench();
  const runIndex = side === "left" ? 0 : 1;
  const run = findRun(snapshot, selection.comparedRunIds[runIndex]);
  if (run === null) return <MissingRun />;
  const result = findCaseResult(run, selection.activeCaseId);
  return (
    <div className={`bench-comparison-window ${NO_WHEEL_CLASS_NAME}`}>
      <RunSummary run={run} />
      <CaseResult run={run} result={result} />
    </div>
  );
}

function MissingRun() {
  return (
    <div className="bench-window-empty">
      <strong>No run selected</strong>
      <span>Choose a terminal run in the Review pane.</span>
    </div>
  );
}

function RunSummary({ run }: { run: RunV1 }) {
  const artifactBytes = medianArtifactBytes(run);
  return (
    <div className="bench-comparison-summary">
      <div>
        <span>Candidate</span>
        <strong>{run.candidateName}</strong>
      </div>
      <div>
        <span>Median artifact</span>
        <strong>
          {artifactBytes === null ? "—" : formatBytes(artifactBytes)}
        </strong>
      </div>
      <div>
        <span>Duration</span>
        <strong>{formatDuration(runDuration(run))}</strong>
      </div>
      <div>
        <span>Failed checks</span>
        <strong>{failedFindingCount(run)}</strong>
      </div>
    </div>
  );
}

function CaseResult({
  result,
  run,
}: {
  result: CaseResultV1 | null;
  run: RunV1;
}) {
  if (result === null) {
    return (
      <div className="bench-window-empty">
        <strong>No aligned result</strong>
        <span>This run does not contain the selected case.</span>
      </div>
    );
  }
  return (
    <div className="bench-case-result">
      <div className="bench-case-result-heading">
        <div>
          <span>{result.caseId}</span>
          <strong>{result.caseName}</strong>
        </div>
        <span className="bench-status" data-status={result.status}>
          {result.status}
        </span>
      </div>
      <ArtifactResult
        artifact={primaryArtifact(result)}
        candidateName={run.candidateName}
        caseName={result.caseName}
      />
      <Findings result={result} />
      <Observations observations={result.observations} />
      <StructuredOutput output={result.output} />
      <ResultError result={result} />
    </div>
  );
}

function ArtifactResult({
  artifact,
  candidateName,
  caseName,
}: {
  artifact: ArtifactReferenceV1 | null;
  candidateName: string;
  caseName: string;
}) {
  if (artifact === null) {
    return <div className="bench-artifact-empty">No artifact</div>;
  }
  if (artifact.mediaType.startsWith("image/")) {
    return (
      <figure className="bench-artifact-preview">
        <img
          alt={`${candidateName} output for ${caseName}`}
          src={artifactUrl(artifact.id)}
        />
        <figcaption>
          <span>{artifact.name}</span>
          <span>{formatBytes(artifact.byteLength)}</span>
        </figcaption>
      </figure>
    );
  }
  return (
    <a className="bench-artifact-download" href={artifactUrl(artifact.id)}>
      Open {artifact.name} · {formatBytes(artifact.byteLength)}
    </a>
  );
}

function Findings({ result }: { result: CaseResultV1 }) {
  if (result.findings.length === 0) {
    return (
      <div className="bench-findings">
        <h3>Checks</h3>
        <p>No checks recorded.</p>
      </div>
    );
  }
  return (
    <div className="bench-findings">
      <h3>Checks</h3>
      <ul>
        {result.findings.map((finding) => (
          <li data-status={finding.status} key={finding.checkId}>
            <span>{finding.checkName}</span>
            <strong>{findingLabel(finding)}</strong>
            <small>{finding.message}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Observations({
  observations,
}: {
  observations: ReadonlyArray<ObservationV1>;
}) {
  if (observations.length === 0) return null;
  return (
    <div className="bench-observations">
      <h3>Observations</h3>
      <dl>
        {observations.map((observation) => (
          <div key={observation.id}>
            <dt>{observation.name}</dt>
            <dd>{observationValue(observation)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StructuredOutput({ output }: { output: unknown }) {
  if (output === null) return null;
  return (
    <details className="bench-result-output">
      <summary>Structured output</summary>
      <pre>{JSON.stringify(output, null, 2)}</pre>
    </details>
  );
}

function ResultError({ result }: { result: CaseResultV1 }) {
  if (result.error === null) return null;
  return (
    <p className="bench-pane-error" role="alert">
      {result.error.message}
    </p>
  );
}

function observationValue(observation: ObservationV1): string {
  if (observation.kind === "number") {
    return observation.numberValue === null
      ? "—"
      : String(observation.numberValue);
  }
  if (observation.kind === "boolean") {
    return observation.booleanValue === null
      ? "—"
      : observation.booleanValue
        ? "true"
        : "false";
  }
  return observation.textValue ?? "—";
}
