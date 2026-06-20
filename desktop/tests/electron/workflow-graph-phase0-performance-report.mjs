import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { repoRoot } from "./electron-cdp-harness.mjs";

const requiredSceneVisitCounterNames = [
  "settaOwnedLayerVisits",
  "graphObjectsConsidered",
  "cullCandidatesChecked",
  "displayObjectsTraversed",
  "labelsConsidered",
  "boundsCalculations",
];

export function phase0PerformanceGateReport({ artifactRoot, summaries }) {
  const scenarios = summaries.map((summary) => ({
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
  }));
  const matrixChecks = phase0MatrixChecks(scenarios);
  return {
    artifactRoot,
    generatedAt: new Date().toISOString(),
    matrixChecks,
    scenarios,
    status:
      scenarios.every((scenario) =>
        scenario.checks.every((check) => check.severity !== "hard" || check.status === "pass"),
      ) && matrixChecks.every((check) => check.severity !== "hard" || check.status === "pass")
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

export function assertPhase0MatrixGatePassed(phase0Gate) {
  const failures = [
    ...(phase0Gate.matrixChecks ?? []),
    ...phase0Gate.scenarios.flatMap((scenario) => scenario.checks),
  ]
    .filter((check) => check.severity === "hard" && check.status !== "pass")
    .map((check) => `${check.id}: ${check.summary}`);
  if (failures.length > 0) {
    throw new Error(`phase 0 performance matrix failed: ${failures.join("; ")}`);
  }
}

function phase0PerformanceReportMarkdown(report) {
  const rows = report.scenarios.map(scenarioReportRow).join("\n");
  const matrixChecks = report.matrixChecks.map(formatScenarioCheck).join("\n");
  const checkSections = report.scenarios.map(scenarioCheckSection).join("\n");
  return `
## Run ${report.generatedAt}

Artifact root: \`${report.artifactRoot}\`

Phase 1 readiness: ${report.status === "passed" ? "ready" : "blocked"}

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Matrix Checks

${matrixChecks}

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
    wheelLatency.eventTimestampToFirstPixiRenderAfterCameraMs?.p95,
  )} | ${formatSceneVisitBudget(scenario)} | ${scenario.render.totalDisplayObjectCount} | ${
    scenario.diagnostics.paneMutations?.cameraCausedCount ?? 0
  } | ${
    scenario.diagnostics.reactCommits?.cameraCausedCount ?? 0
  } | ${hardFailures} | ${reportOnlyFindings} |`;
}

function phase0MatrixChecks(scenarios) {
  if (scalingScenarios(scenarios).length === 0) {
    return [];
  }
  return [
    phase0ScalingRequiredSceneVisitCountersCheck(scenarios),
    phase0ScalingSceneVisitBudgetCheck(scenarios),
    phase0ScalingSceneVisitGrowthCheck(scenarios),
  ];
}

function phase0ScalingRequiredSceneVisitCountersCheck(scenarios) {
  const scaling = scalingScenarios(scenarios);
  const missing = scaling.flatMap(missingSceneVisitCounterNames);
  return hardCheck({
    actual: missing.length,
    budget: 0,
    id: "scaling-required-scene-visit-counters-present",
    pass: scaling.length > 1 && missing.length === 0,
    summary: `scalingRuns=${scaling.length}, missing=${missing.join(",") || "none"}`,
  });
}

function missingSceneVisitCounterNames(scenario) {
  const counters = sceneVisitCountersForScenario(scenario);
  if (!counters) {
    return [`${scenario.nodeCount}:sceneVisitCounters`];
  }
  const stats = counters.cameraFrameSceneVisitStats;
  const missing = missingCameraFrameSamples(scenario, stats);
  for (const counterName of requiredSceneVisitCounterNames) {
    if (!stats?.counters?.[counterName]) {
      missing.push(`${scenario.nodeCount}:${counterName}`);
    }
  }
  return missing;
}

function missingCameraFrameSamples(scenario, stats) {
  return !stats || Number(stats.sampleCount ?? 0) <= 0
    ? [`${scenario.nodeCount}:cameraFrameSamples`]
    : [];
}

function phase0ScalingSceneVisitBudgetCheck(scenarios) {
  const failures = scalingScenarios(scenarios)
    .map((scenario) => scalingSceneVisitBudgetResult(scenario))
    .filter((result) => !result.pass);
  return hardCheck({
    actual: failures.length,
    budget: 0,
    id: "scaling-scene-visits-within-visible-renderable-budget",
    pass: failures.length === 0,
    summary:
      failures.length === 0
        ? scalingScenarios(scenarios).map(formatScalingSceneVisitResult).join("; ")
        : failures.map(formatScalingSceneVisitResult).join("; "),
  });
}

function phase0ScalingSceneVisitGrowthCheck(scenarios) {
  const { growth, largest, scaling, smallest } = phase0ScalingSceneVisitGrowth(scenarios);
  return hardCheck({
    actual: growth,
    budget: 0.05,
    id: "scaling-scene-visits-grow-under-five-percent",
    pass: phase0ScalingSceneVisitGrowthPasses({ growth, largest, scaling, smallest }),
    summary: formatPhase0ScalingSceneVisitGrowth({ growth, largest, smallest }),
  });
}

function phase0ScalingSceneVisitGrowth(scenarios) {
  const scaling = scalingScenarios(scenarios)
    .map((scenario) => ({
      nodeCount: Number(scenario.nodeCount ?? 0),
      p95: sceneVisitP95(scenario),
    }))
    .filter((entry) => Number.isFinite(entry.nodeCount) && Number.isFinite(entry.p95))
    .sort((left, right) => left.nodeCount - right.nodeCount);
  const smallest = scaling[0] ?? null;
  const largest = scaling.at(-1) ?? null;
  return {
    growth: sceneVisitGrowthRatio({ largest, smallest }),
    largest,
    scaling,
    smallest,
  };
}

function phase0ScalingSceneVisitGrowthPasses({ growth, largest, scaling, smallest }) {
  if (scaling.length <= 1 || !smallest || !largest || !Number.isFinite(growth)) {
    return false;
  }
  return growth <= 0.05 && largest.p95 >= 0 && smallest.p95 >= 0;
}

function formatPhase0ScalingSceneVisitGrowth({ growth, largest, smallest }) {
  return smallest && largest
    ? `smallest=${smallest.nodeCount}:${smallest.p95}, largest=${largest.nodeCount}:${largest.p95}, growth=${formatReportNumber(growth)}`
    : "not enough scaling runs";
}

function sceneVisitGrowthRatio({ largest, smallest }) {
  return smallest && largest && smallest.p95 > 0
    ? (largest.p95 - smallest.p95) / smallest.p95
    : null;
}

function scalingScenarios(scenarios) {
  return scenarios
    .filter((scenario) => scenario.scenario === "scaling")
    .sort((left, right) => Number(left.nodeCount ?? 0) - Number(right.nodeCount ?? 0));
}

function scalingSceneVisitBudgetResult(scenario) {
  const p95 = sceneVisitP95(scenario);
  const visibleRenderableCount = sceneVisitVisibleRenderableCount(scenario);
  const budget = Number.isFinite(visibleRenderableCount)
    ? visibleRenderableCount * 4 + 512
    : Number.NaN;
  return {
    budget,
    nodeCount: scenario.nodeCount,
    p95,
    pass: Number.isFinite(p95) && Number.isFinite(budget) && p95 <= budget,
    visibleRenderableCount,
  };
}

function sceneVisitP95(scenario) {
  return Number(
    sceneVisitCountersForScenario(scenario)?.cameraFrameSceneVisitStats?.counters?.totalSceneVisits
      ?.p95,
  );
}

function sceneVisitVisibleRenderableCount(scenario) {
  return Number(sceneVisitCountersForScenario(scenario)?.visibleRenderableCount);
}

function sceneVisitCountersForScenario(scenario) {
  return scenario.render?.sceneVisitCounters ?? null;
}

function formatScalingSceneVisitResult(result) {
  return `${result.nodeCount}:p95=${formatReportNumber(result.p95)} budget=${formatReportNumber(
    result.budget,
  )} visibleRenderableCount=${formatReportNumber(result.visibleRenderableCount)}`;
}

function formatSceneVisitBudget(scenario) {
  const result = scalingSceneVisitBudgetResult(scenario);
  if (!Number.isFinite(result.p95) || !Number.isFinite(result.budget)) {
    return "";
  }
  return `${formatReportNumber(result.p95)} / ${formatReportNumber(result.budget)}`;
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
  const budget = check.budget == null ? "" : ` budget=${check.budget}`;
  return `- ${check.severity} ${check.id}: ${check.status}; actual=${check.actual}${budget}; ${check.summary}`;
}

function hardCheck({ actual, budget = null, id, pass, summary }) {
  return { actual, budget, id, severity: "hard", status: pass ? "pass" : "fail", summary };
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function formatReportNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}
