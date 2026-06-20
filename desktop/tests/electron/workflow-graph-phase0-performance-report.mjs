import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { repoRoot } from "./electron-cdp-harness.mjs";

export function phase0PerformanceGateReport({ artifactRoot, summaries }) {
  return {
    artifactRoot,
    generatedAt: new Date().toISOString(),
    scenarios: summaries.map((summary) => ({
      artifactDir: summary.artifactDir,
      artifacts: summary.artifacts,
      checks: summary.phase0Gate.checks,
      diagnostics: summary.artifacts.metrics,
      inputCountsByKind: summary.phase0Gate.inputCountsByKind,
      inputEventCount: summary.phase0Gate.inputEventCount,
      nodeCount: summary.nodeCount,
      render: summary.final.render,
      runMetadata: summary.runMetadata,
      scenario: summary.scenario,
      syntheticScene: summary.syntheticScene,
    })),
    status: summaries.every((summary) =>
      summary.phase0Gate.checks.every(
        (check) => check.severity !== "hard" || check.status === "pass",
      ),
    )
      ? "passed"
      : "failed",
  };
}

export async function appendPhase0PerformanceReport(report) {
  const reportPath = join(
    repoRoot,
    "docs",
    "reports",
    "performance",
    "workspace-graph-pan-zoom-surface-runtime.md",
  );
  await mkdir(dirname(reportPath), { recursive: true });
  await appendFile(reportPath, phase0PerformanceReportMarkdown(report));
}

function phase0PerformanceReportMarkdown(report) {
  const rows = report.scenarios.map(scenarioReportRow).join("\n");
  const checkSections = report.scenarios.map(scenarioCheckSection).join("\n");
  return `
## Run ${report.generatedAt}

Artifact root: \`${report.artifactRoot}\`

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 input-present ms | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

${checkSections}
`;
}

function scenarioReportRow(scenario) {
  const hardFailures = countScenarioChecks(scenario, hardCheckFailed);
  const reportOnlyFindings = countScenarioChecks(scenario, reportOnlyCheckReported);
  const wheelLatency = scenario.diagnostics.wheelLatency ?? {};
  return `| ${escapeMarkdown(scenario.scenario)} | ${escapeMarkdown(
    scenario.syntheticScene,
  )} | ${scenario.nodeCount} | ${formatReportNumber(
    scenario.render.p95FrameMs,
  )} | ${formatReportNumber(wheelLatency.eventDeliveryDelayMs?.p95)} | ${formatReportNumber(
    wheelLatency.eventTimestampToRenderedFrameMs?.p95,
  )} | ${scenario.render.totalDisplayObjectCount} | ${
    scenario.diagnostics.paneMutations?.cameraCausedCount ?? 0
  } | ${
    scenario.diagnostics.reactCommits?.cameraCausedCount ?? 0
  } | ${hardFailures} | ${reportOnlyFindings} |`;
}

function countScenarioChecks(scenario, predicate) {
  return scenario.checks.filter(predicate).length;
}

function hardCheckFailed(check) {
  return check.severity === "hard" && check.status !== "pass";
}

function reportOnlyCheckReported(check) {
  return check.severity === "report-only" && check.status !== "pass";
}

function scenarioCheckSection(scenario) {
  const metadata = scenarioReportMetadata(scenario);
  const checks = scenario.checks.map(formatScenarioCheck).join("\n");
  return `## ${scenario.scenario} / ${scenario.syntheticScene}

- build: ${metadata.buildMode}
- seed: ${metadata.randomSeed}
- warm-up/repetitions: ${metadata.warmUpCount} / ${metadata.repetitionCount}
- viewport/DPR/refresh: ${metadata.viewportWidth}x${metadata.viewportHeight} / ${metadata.devicePixelRatio} / ${metadata.refreshRateEstimateHz}Hz
- recording/debug: ${metadata.recordingEnabled} / ${metadata.workflowGraphDebugEnabled}
- timing thresholds: ${metadata.timingThresholds}

${checks}
`;
}

function scenarioReportMetadata(scenario) {
  const workload = scenarioWorkloadMetadata(scenario);
  const display = scenarioDisplayMetadata(scenario);
  const build = scenarioBuildMetadata(scenario);
  return {
    buildMode: metadataValue(build.mode, "unknown"),
    devicePixelRatio: metadataValue(display.devicePixelRatio, "?"),
    randomSeed: metadataValue(workload.randomSeed, "not-recorded"),
    recordingEnabled: build.recordingEnabled ? "on" : "off",
    refreshRateEstimateHz: metadataValue(display.refreshRateEstimateHz, "?"),
    repetitionCount: metadataValue(workload.repetitionCount, "not-recorded"),
    timingThresholds: metadataValue(build.timingThresholds, "report-only"),
    viewportHeight: displayViewportValue(display, "height"),
    viewportWidth: displayViewportValue(display, "width"),
    warmUpCount: metadataValue(workload.warmUpCount, "not-recorded"),
    workflowGraphDebugEnabled: build.workflowGraphDebugEnabled ? "on" : "off",
  };
}

function scenarioWorkloadMetadata(scenario) {
  return scenario.runMetadata?.benchmark?.workload ?? {};
}

function scenarioDisplayMetadata(scenario) {
  return scenario.runMetadata?.display ?? {};
}

function scenarioBuildMetadata(scenario) {
  return scenario.runMetadata?.build ?? {};
}

function displayViewportValue(display, key) {
  return metadataValue(display.viewport?.[key], "?");
}

function metadataValue(value, fallback) {
  return value ?? fallback;
}

function formatScenarioCheck(check) {
  const budget = check.budget === null ? "" : ` budget=${check.budget}`;
  return `- ${check.severity} ${check.id}: ${check.status}; actual=${check.actual}${budget}; ${check.summary}`;
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function formatReportNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}
