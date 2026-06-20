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

const phase3ScenarioSignalDefinitions = [
  {
    label: "camera-caused workspace presentation writes",
    value: (scenario) => scenario.diagnostics?.paneMutations?.cameraCausedCount,
  },
  {
    label: "camera-caused React commits",
    value: (scenario) => scenario.diagnostics?.reactCommits?.cameraCausedCount,
  },
  {
    label: "camera-caused graph scene replacement",
    value: (scenario) => scenario.diagnostics?.graphSceneReplacementCount,
  },
];

export function phase0PerformanceGateReport({ artifactRoot, phase = "phase0", summaries }) {
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
  const status = phase0ReportStatus({ matrixChecks, scenarios });
  return {
    artifactRoot,
    generatedAt: new Date().toISOString(),
    matrixChecks,
    phase,
    phase3Gate: phase === "phase3" ? phase3GateDecision({ matrixChecks, scenarios }) : null,
    scenarios,
    status,
  };
}

function phase0ReportStatus({ matrixChecks, scenarios }) {
  return scenarios.every((scenario) =>
    scenario.checks.every((check) => check.severity !== "hard" || check.status === "pass"),
  ) && matrixChecks.every((check) => check.severity !== "hard" || check.status === "pass")
    ? "passed"
    : "failed";
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
  const gateSection = report.phase === "phase3" ? phase3GateMarkdown(report.phase3Gate) : "";
  return `
## Run ${report.generatedAt}${report.phase === "phase3" ? " (Phase 3)" : ""}

Artifact root: \`${report.artifactRoot}\`

${phaseStatusLine(report)}
${gateSection}

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task | Hard failures | Report-only findings |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
${rows}

## Matrix Checks

${matrixChecks}

${checkSections}
`;
}

function phaseStatusLine(report) {
  if (report.phase === "phase3") {
    return `Phase 3 gate status: ${report.status === "passed" ? "passed" : "blocked"}`;
  }
  return `Phase 1 readiness: ${report.status === "passed" ? "ready" : "blocked"}`;
}

function phase3GateMarkdown(gate) {
  if (!gate) {
    return "";
  }
  return `
Phase 4 decision: ${gate.phase4Decision}

- remaining issue classification: ${gate.remainingIssue}
- input-to-presented-frame: ${gate.presentedFrameStatus}
- evidence basis: ${gate.evidenceBasis}
`;
}

function scenarioReportRow(scenario) {
  const hardFailures = countScenarioChecks(scenario, hardCheckFailed);
  const reportOnlyFindings = countScenarioChecks(scenario, reportOnlyCheckReported);
  const wheelLatency = scenario.diagnostics.wheelLatency ?? {};
  return `| ${escapeMarkdown(scenario.scenario)} | ${recordingModeLabel(scenario)} | ${escapeMarkdown(
    scenario.syntheticScene,
  )} | ${scenario.nodeCount} | ${formatReportNumber(
    scenario.render.p95FrameMs,
  )} | ${formatReportNumber(wheelLatency.eventDeliveryDelayMs?.p95)} | ${formatReportNumber(
    wheelLatency.eventTimestampToFirstPixiRenderAfterCameraMs?.p95,
  )} | ${formatSceneVisitBudget(scenario)} | ${scenario.render.totalDisplayObjectCount} | ${
    scenario.diagnostics.paneMutations?.cameraCausedCount ?? 0
  } | ${
    scenario.diagnostics.reactCommits?.cameraCausedCount ?? 0
  } | ${escapeMarkdown(formatTopTraceTask(scenario))} | ${hardFailures} | ${reportOnlyFindings} |`;
}

function phase3GateDecision({ matrixChecks, scenarios }) {
  const hardFailures = [
    ...matrixChecks.filter(hardCheckFailed),
    ...scenarios.flatMap((scenario) => scenario.checks.filter(hardCheckFailed)),
  ];
  const presentedFrameBlocked = scenarios.some((scenario) =>
    scenario.checks.some((check) => check.id === "input-to-presented-frame-budget-blocked"),
  );
  const competingWork = phase3CompetingWorkSignals(scenarios);
  if (hardFailures.length > 0) {
    return {
      evidenceBasis: hardFailures.map((check) => check.id).join(", "),
      phase4Decision: "blocked until hard structural/scaling failures are fixed",
      presentedFrameStatus: phase3PresentedFrameStatus(presentedFrameBlocked),
      remainingIssue: phase3RemainingIssue({ competingWork, hardFailures, scenarios }),
    };
  }
  if (competingWork.length > 0) {
    return {
      evidenceBasis: competingWork.join(", "),
      phase4Decision: "justified by trace evidence; proceed to Phase 4",
      presentedFrameStatus: phase3PresentedFrameStatus(presentedFrameBlocked),
      remainingIssue: phase3RemainingIssue({ competingWork, hardFailures, scenarios }),
    };
  }
  return {
    evidenceBasis:
      "duplicate renderer, presentation write, React commit, full replacement, and scene-visit scaling hard gates passed in every run",
    phase4Decision: "deferred; do not build the shared frame admission coordinator yet",
    presentedFrameStatus: phase3PresentedFrameStatus(presentedFrameBlocked),
    remainingIssue: phase3RemainingIssue({ competingWork, hardFailures, scenarios }),
  };
}

function phase3PresentedFrameStatus(presentedFrameBlocked) {
  return presentedFrameBlocked
    ? "not available; no compositor presentation trace source is wired, first-Pixi-render remains proxy evidence"
    : "reported";
}

function phase3RemainingIssue({ competingWork, hardFailures, scenarios }) {
  if (hardFailures.length > 0) {
    return "hard structural or scaling regression";
  }
  if (competingWork.length > 0) {
    return "competing scheduled graph, presentation, React, layout, semantic, or trajectory work";
  }
  const classifications = new Set(scenarios.map(classifyScenarioRemainingIssue));
  if (classifications.has("event delivery")) {
    return "event delivery and browser main-thread task timing";
  }
  if (classifications.has("browser layout/paint")) {
    return "browser layout/paint";
  }
  if (classifications.has("GC")) {
    return "GC";
  }
  if (classifications.has("Pixi draw work")) {
    return "Pixi draw work";
  }
  return "recording overhead or non-reference-runner timing noise";
}

function phase3CompetingWorkSignals(scenarios) {
  const signals = new Set();
  for (const scenario of scenarios) {
    appendPhase3ScenarioSignals(signals, scenario);
    for (const task of topTraceEvents(scenario)) {
      const signal = phase3TraceTaskSignal(task);
      if (signal) {
        signals.add(signal);
      }
    }
  }
  return [...signals];
}

function appendPhase3ScenarioSignals(signals, scenario) {
  for (const definition of phase3ScenarioSignalDefinitions) {
    if (Number(definition.value(scenario) ?? 0) > 0) {
      signals.add(definition.label);
    }
  }
}

function phase3TraceTaskSignal(task) {
  if (!phase3TraceTaskShowsCompetingWork(task)) {
    return "";
  }
  return `trace:${task.name}`;
}

function phase3TraceTaskShowsCompetingWork(task) {
  return /semantic|trajectory|graph scene|workspace presentation|react commit|layout|style|paint|composit/i.test(
    traceTaskText(task),
  );
}

function traceTaskText(task) {
  return `${task.name ?? ""} ${task.category ?? ""}`;
}

function classifyScenarioRemainingIssue(scenario) {
  const wheelLatency = scenario.diagnostics?.wheelLatency ?? {};
  const p95Delivery = Number(wheelLatency.eventDeliveryDelayMs?.p95 ?? 0);
  if (p95Delivery > refreshIntervalBudgetMs(scenario)) {
    return "event delivery";
  }
  const topTasks = topTraceEvents(scenario);
  if (topTasks.some((task) => /layout|style|paint|composit/i.test(task.name ?? ""))) {
    return "browser layout/paint";
  }
  if (topTasks.some((task) => /gc/i.test(`${task.name ?? ""} ${task.category ?? ""}`))) {
    return "GC";
  }
  if (pixiRenderWorstMs(scenario) > refreshIntervalBudgetMs(scenario)) {
    return "Pixi draw work";
  }
  return "recording overhead or timing noise";
}

function refreshIntervalBudgetMs(scenario) {
  const refreshRate = Number(scenario.runMetadata?.display?.refreshRateEstimateHz ?? 60);
  return Number.isFinite(refreshRate) && refreshRate > 0 ? 1000 / refreshRate + 8 : 24;
}

function pixiRenderWorstMs(scenario) {
  return Number(scenario.diagnostics?.timingBucketDeltas?.["pixi-render"]?.worstMs ?? 0);
}

function formatTopTraceTask(scenario) {
  const task = topTraceEvents(scenario)[0];
  if (!task) {
    return "";
  }
  return `${task.name} ${formatReportNumber(task.durationMs)}ms`;
}

function topTraceEvents(scenario) {
  const summary = scenario.artifacts?.traceSummary ?? {};
  return [...(summary.topLevelTasks ?? []), ...(summary.topCompleteEvents ?? [])]
    .filter((event) => Number.isFinite(Number(event.durationMs)))
    .sort((left, right) => Number(right.durationMs) - Number(left.durationMs))
    .slice(0, 20);
}

function recordingModeLabel(scenario) {
  return scenario.runMetadata?.build?.recordingEnabled === false ? "off" : "on";
}

function phase0MatrixChecks(scenarios) {
  if (scalingScenarios(scenarios).length === 0) {
    return [];
  }
  const groups = scalingScenarioGroups(scenarios);
  return groups.flatMap(({ label, scenarios: groupScenarios }) => {
    const checks = [
      phase0ScalingRequiredSceneVisitCountersCheck(groupScenarios),
      phase0ScalingSceneVisitBudgetCheck(groupScenarios),
      phase0ScalingSceneVisitGrowthCheck(groupScenarios),
    ];
    return groups.length === 1
      ? checks
      : checks.map((check) => checkWithRecordingMode(check, label));
  });
}

function scalingScenarioGroups(scenarios) {
  const groups = new Map();
  for (const scenario of scalingScenarios(scenarios)) {
    const label = recordingModeLabel(scenario);
    const group = groups.get(label) ?? [];
    group.push(scenario);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, groupScenarios]) => ({ label, scenarios: groupScenarios }));
}

function checkWithRecordingMode(check, label) {
  return {
    ...check,
    id: `${check.id}-${label}`,
    summary: `recording=${label}; ${check.summary}`,
  };
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
  const results = scalingScenarios(scenarios).map((scenario) =>
    scalingSceneVisitBudgetResult(scenario),
  );
  const failures = results.filter((result) => !result.pass);
  return hardCheck({
    actual: failures.length,
    budget: 0,
    id: "scaling-scene-visits-within-visible-renderable-budget",
    pass: failures.length === 0,
    summary:
      failures.length === 0
        ? results.map(formatScalingSceneVisitResult).join("; ")
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
  if (!smallest || !largest) {
    return null;
  }
  if (smallest.p95 === 0) {
    return largest.p95 === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return (largest.p95 - smallest.p95) / smallest.p95;
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
  const traceTasks = formatScenarioTraceTasks(scenario);
  return `## ${scenario.scenario} / ${scenario.syntheticScene} / recording-${metadata.recordingEnabled}

- build: ${metadata.buildMode}
- seed: ${metadata.randomSeed}
- warm-up/repetitions: ${metadata.warmUpCount} / ${metadata.repetitionCount}
- viewport/DPR/refresh: ${metadata.viewportWidth}x${metadata.viewportHeight} / ${metadata.devicePixelRatio} / ${metadata.refreshRateEstimateHz}Hz
- recording/debug: ${metadata.recordingEnabled} / ${metadata.workflowGraphDebugEnabled}
- timing thresholds: ${metadata.timingThresholds}
- trace top tasks: ${traceTasks}

${checks}
`;
}

function formatScenarioTraceTasks(scenario) {
  const tasks = topTraceEvents(scenario)
    .slice(0, 3)
    .map((task) => {
      return `${task.name} ${formatReportNumber(task.durationMs)}ms`;
    });
  return tasks.length > 0 ? tasks.join("; ") : "none";
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
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "";
}
