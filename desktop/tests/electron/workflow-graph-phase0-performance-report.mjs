import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { repoRoot } from "./electron-cdp-harness.mjs";
import { summarizeWorkflowGraphPerformanceDiagnostics } from "./workflow-graph-performance-recording.mjs";
import {
  phase0CheckBlocksGate,
  phase0PerformanceScenarioGate,
  workflowGraphSemanticTrafficDuringInteraction,
} from "./workflow-graph-phase0-performance-guardrails.mjs";

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

const scenarioOrder = [
  "simple",
  "normal",
  "dense",
  "stress",
  "scaling",
  "large",
  "baseline",
  "active",
  "small-active",
  "small-trackpad",
];

export async function parsePanZoomPerformanceArtifacts({ artifactRoot, phase = "phase0" }) {
  const resolvedArtifactRoot = resolve(artifactRoot);
  const scenarioEntries = await panZoomScenarioArtifactEntries(resolvedArtifactRoot);
  const summaries = [];
  for (const entry of scenarioEntries) {
    summaries.push(await parsePanZoomScenarioArtifacts(entry));
  }
  return buildPanZoomPerformanceReport({
    artifactRoot: resolvedArtifactRoot,
    phase,
    source: "artifact-parser",
    summaries,
  });
}

function buildPanZoomPerformanceReport({ artifactRoot, phase, source, summaries }) {
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
    reportKind: "workspace-graph-pan-zoom-performance",
    source,
    scenarios,
    status,
  };
}

function phase0ReportStatus({ matrixChecks, scenarios }) {
  return scenarios.every((scenario) => !scenario.checks.some(phase0CheckBlocksGate)) &&
    !matrixChecks.some(phase0CheckBlocksGate)
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
  await appendFile(reportPath, panZoomPerformanceReportMarkdown(report));
}

export function assertPhase0MatrixGatePassed(phase0Gate) {
  const failures = [
    ...(phase0Gate.matrixChecks ?? []),
    ...phase0Gate.scenarios.flatMap((scenario) => scenario.checks),
  ]
    .filter(phase0CheckBlocksGate)
    .map((check) => `${check.id} [${check.severity}/${check.status}]: ${check.summary}`);
  if (failures.length > 0) {
    throw new Error(`phase 0 performance matrix failed: ${failures.join("; ")}`);
  }
}

async function panZoomScenarioArtifactEntries(artifactRoot) {
  const rootSummary = await readOptionalJson(join(artifactRoot, "summary.json"));
  if (Array.isArray(rootSummary?.scenarios) && rootSummary.scenarios.length > 0) {
    return rootSummary.scenarios
      .map((summary) => ({
        artifactDir: resolveScenarioArtifactDir(artifactRoot, summary.artifactDir),
        summary,
      }))
      .sort(comparePanZoomScenarioEntries);
  }
  if (await fileExists(join(artifactRoot, "pan-zoom-debug-snapshots.json"))) {
    return [{ artifactDir: artifactRoot, summary: rootSummary ?? {} }];
  }
  const summaryPaths = await findScenarioSummaryPaths(artifactRoot);
  const entries = [];
  for (const summaryPath of summaryPaths) {
    const artifactDir = dirname(summaryPath);
    if (!(await fileExists(join(artifactDir, "pan-zoom-debug-snapshots.json")))) {
      continue;
    }
    entries.push({
      artifactDir,
      summary: await readJson(summaryPath),
    });
  }
  if (entries.length === 0) {
    throw new Error(`no pan/zoom scenario artifacts found under ${artifactRoot}`);
  }
  return entries.sort(comparePanZoomScenarioEntries);
}

function resolveScenarioArtifactDir(artifactRoot, artifactDir) {
  if (!artifactDir) {
    throw new Error(`scenario summary under ${artifactRoot} is missing artifactDir`);
  }
  return resolve(artifactDir);
}

async function parsePanZoomScenarioArtifacts({ artifactDir, summary }) {
  const context = await readPanZoomScenarioArtifactContext({ artifactDir, summary });
  const semanticTraffic = await workflowGraphSemanticTrafficDuringInteraction({
    artifactDir,
    inputWindow: context.metrics.inputWindow,
  });
  return parsedPanZoomScenarioSummary({ ...context, semanticTraffic });
}

async function readPanZoomScenarioArtifactContext({ artifactDir, summary }) {
  const paths = panZoomScenarioArtifactPaths(artifactDir);
  const [inputSamples, performanceTimeline, snapshots, traceSummary, runMetadata] =
    await Promise.all([
      readJson(paths.inputSamplesPath),
      readJson(paths.performancePath),
      readJson(paths.snapshotsPath),
      readJson(paths.traceSummaryPath),
      readJson(paths.runMetadataPath),
    ]);
  const metrics = summarizeWorkflowGraphPerformanceDiagnostics({
    inputSamples,
    performanceTimeline,
    snapshots,
  });
  const artifacts = {
    contactSheet: summary.artifacts?.contactSheet ?? null,
    finalScreenshot: summary.artifacts?.finalScreenshot ?? join(artifactDir, "final.png"),
    initialScreenshot: summary.artifacts?.initialScreenshot ?? join(artifactDir, "initial.png"),
    inputSamplesPath: paths.inputSamplesPath,
    metrics,
    performancePath: paths.performancePath,
    snapshotsPath: paths.snapshotsPath,
    tracePath: paths.tracePath,
    traceSummary,
    traceSummaryPath: paths.traceSummaryPath,
  };
  return { artifactDir, artifacts, metrics, runMetadata, snapshots, summary };
}

function parsedPanZoomScenarioSummary({
  artifactDir,
  artifacts,
  metrics,
  runMetadata,
  semanticTraffic,
  snapshots,
  summary,
}) {
  const snapshotsPair = parsedScenarioSnapshots({ snapshots, summary });
  const identity = parsedScenarioIdentity({ artifactDir, runMetadata, summary });
  const phase0Gate = phase0PerformanceScenarioGate({
    artifacts,
    diagnostics: metrics,
    final: snapshotsPair.final,
    initial: snapshotsPair.initial,
    scenario: identity.scenario,
    semanticTraffic,
    syntheticScene: identity.syntheticScene,
  });
  return {
    artifactDir,
    artifacts,
    final: snapshotsPair.final,
    hitTesting: summary.hitTesting ?? null,
    initial: snapshotsPair.initial,
    nodeCount: snapshotsPair.final.graph.nodeCount,
    phase0Gate,
    recordingEnabled: runMetadata.build?.recordingEnabled !== false,
    runMetadata,
    scenario: identity.scenario,
    status: summary.status ?? "parsed",
    syntheticScene: identity.syntheticScene,
  };
}

function parsedScenarioSnapshots({ snapshots, summary }) {
  return {
    final: summary.final ?? compactScenarioSnapshot(snapshots.at(-1)?.snapshot),
    initial: summary.initial ?? compactScenarioSnapshot(snapshots[0]?.snapshot),
  };
}

function parsedScenarioIdentity({ artifactDir, runMetadata, summary }) {
  return {
    scenario: summary.scenario ?? scenarioFromArtifactDir(artifactDir),
    syntheticScene: summary.syntheticScene ?? syntheticSceneFromRunMetadata(runMetadata),
  };
}

function panZoomScenarioArtifactPaths(artifactDir) {
  return {
    inputSamplesPath: join(artifactDir, "pan-zoom-input-samples.json"),
    performancePath: join(artifactDir, "pan-zoom-performance-observer.json"),
    runMetadataPath: join(artifactDir, "run-metadata.json"),
    snapshotsPath: join(artifactDir, "pan-zoom-debug-snapshots.json"),
    tracePath: join(artifactDir, "pan-zoom-cdp-trace.json"),
    traceSummaryPath: join(artifactDir, "pan-zoom-cdp-trace-summary.json"),
  };
}

function compactScenarioSnapshot(snapshot) {
  if (!snapshot) {
    throw new Error("pan/zoom debug snapshots are missing before/after samples");
  }
  return {
    camera: snapshot.camera,
    graph: {
      edgeCount: snapshot.graph.edgeCount,
      nodeCount: snapshot.graph.nodeCount,
      semanticNodeCount: countGraphNodesByLayer(snapshot, "semantic"),
      workflowNodeCount: countGraphNodesByLayer(snapshot, "workflow"),
    },
    render: snapshot.render,
  };
}

function countGraphNodesByLayer(snapshot, layer) {
  return (snapshot.graph.nodes ?? []).filter((node) => node.layer === layer).length;
}

function syntheticSceneFromRunMetadata(runMetadata) {
  return runMetadata.benchmark?.workload?.syntheticScene ?? "unknown";
}

function scenarioFromArtifactDir(artifactDir) {
  const name = artifactDir.split(/[\\/]/).at(-1) ?? "";
  if (name.endsWith("-nodes")) {
    return "scaling";
  }
  return name || "unknown";
}

async function findScenarioSummaryPaths(root, depth = 0, initialRoot = root) {
  if (depth > 5) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (
      entry.isFile() &&
      entry.name === "summary.json" &&
      path !== join(initialRoot, "summary.json")
    ) {
      paths.push(path);
      continue;
    }
    if (entry.isDirectory()) {
      paths.push(...(await findScenarioSummaryPaths(path, depth + 1, initialRoot)));
    }
  }
  return paths;
}

function comparePanZoomScenarioEntries(left, right) {
  return panZoomScenarioSortKey(left).localeCompare(panZoomScenarioSortKey(right));
}

function panZoomScenarioSortKey(entry) {
  const summary = entry.summary ?? {};
  const scenario = summary.scenario ?? scenarioFromArtifactDir(entry.artifactDir);
  const scenarioIndex = scenarioOrder.includes(scenario) ? scenarioOrder.indexOf(scenario) : 99;
  return [
    recordingModeSortLabel(summary),
    String(scenarioIndex).padStart(2, "0"),
    scenario,
    String(Number(summary.nodeCount ?? 0)).padStart(6, "0"),
    entry.artifactDir,
  ].join("|");
}

function recordingModeSortLabel(summary) {
  return summary.runMetadata?.build?.recordingEnabled === false ? "recording-off" : "recording-on";
}

async function readJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function panZoomPerformanceReportMarkdown(report) {
  const diagnosisRows = report.scenarios.map(scenarioDiagnosisReportRow).join("\n");
  const rows = report.scenarios.map(scenarioReportRow).join("\n");
  const matrixChecks = report.matrixChecks.map(formatScenarioCheck).join("\n");
  const checkSections = report.scenarios.map(scenarioCheckSection).join("\n");
  const gateSection = report.phase === "phase3" ? phase3GateMarkdown(report.phase3Gate) : "";
  return `
## Run ${report.generatedAt}${report.phase === "phase3" ? " (Phase 3)" : ""}

Artifact root: \`${report.artifactRoot}\`

${phaseStatusLine(report)}
${gateSection}

Source: ${report.source ?? "unknown"}

## Pan/Zoom Diagnosis

| Scenario | Recording | Interactions | Diagnosis | p95 delivery ms | p95 handler ms | p95 camera commit ms | p95 first Pixi render proxy ms | input-to-presented-frame | frame p50/p95/p99/max ms | Renderer duplicates | Camera DOM writes | Camera React commits | Scene replacements | Deferred work | Top blocker |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
${diagnosisRows}

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task | Hard failures | Report-only findings |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
${rows}

## Matrix Checks

${matrixChecks}

${checkSections}
`;
}

function phaseStatusLine(report) {
  if (report.phase === "phase7") {
    return `Phase 7 report status: ${report.status === "passed" ? "passed" : "blocked"}`;
  }
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

function scenarioDiagnosisReportRow(scenario) {
  const row = scenarioDiagnosisRowData(scenario);
  return `| ${escapeMarkdown(row.scenario)} | ${row.recording} | ${row.interactions} | ${escapeMarkdown(
    row.diagnosis,
  )} | ${row.deliveryP95} | ${row.handlerP95} | ${row.cameraCommitP95} | ${
    row.firstRenderP95
  } | ${escapeMarkdown(row.presentedFrame)} | ${escapeMarkdown(row.frameTiming)} | ${
    row.rendererDuplicates
  } | ${row.cameraDomWrites} | ${row.cameraReactCommits} | ${row.sceneReplacements} | ${escapeMarkdown(
    row.deferredWork,
  )} | ${escapeMarkdown(row.topBlocker)} |`;
}

function scenarioDiagnosisRowData(scenario) {
  const wheelLatency = scenario.diagnostics.wheelLatency ?? {};
  return {
    cameraCommitP95: formatMetricP95(wheelLatency.cameraUpdateDurationMs),
    cameraDomWrites: cameraPaneMutationCount(scenario),
    cameraReactCommits: cameraReactCommitCount(scenario),
    deferredWork: formatDeferredWorkByLane(scenario.diagnostics.deferredWorkByLane),
    deliveryP95: formatMetricP95(wheelLatency.eventDeliveryDelayMs),
    diagnosis: classifyScenarioRemainingIssue(scenario),
    firstRenderP95: formatMetricP95(wheelLatency.eventTimestampToFirstPixiRenderAfterCameraMs),
    frameTiming: formatFrameTiming(scenario.diagnostics.frameTiming ?? {}),
    handlerP95: formatMetricP95(wheelLatency.handlerDurationMs),
    interactions: formatInteractionSummary(scenario),
    presentedFrame: formatInputToPresentedFrame(scenario),
    recording: recordingModeLabel(scenario),
    rendererDuplicates: duplicateRendererSampleCount(scenario),
    scenario: scenario.scenario,
    sceneReplacements: scenario.diagnostics.graphSceneReplacementCount ?? 0,
    topBlocker: formatTopTraceTask(scenario),
  };
}

function formatMetricP95(stats) {
  return formatReportNumber(stats?.p95);
}

function duplicateRendererSampleCount(scenario) {
  return scenario.diagnostics.rendererLifecycle?.duplicateRendererSamples?.length ?? 0;
}

function cameraPaneMutationCount(scenario) {
  return scenario.diagnostics.paneMutations?.cameraCausedCount ?? 0;
}

function cameraReactCommitCount(scenario) {
  return scenario.diagnostics.reactCommits?.cameraCausedCount ?? 0;
}

function formatInteractionSummary(scenario) {
  const interactions = scenario.diagnostics.inputInteractions ?? {};
  const ids = (interactions.items ?? [])
    .filter((interaction) => interaction.cameraInput)
    .slice(0, 4)
    .map((interaction) => `${interaction.kind}#${interaction.id}`);
  const suffix = ids.length > 0 ? ` (${ids.join(", ")})` : "";
  return `${interactions.cameraCount ?? 0}/${interactions.totalCount ?? 0}${suffix}`;
}

function formatInputToPresentedFrame(scenario) {
  const check = scenario.checks.find((candidate) =>
    candidate.id.startsWith("input-to-presented-frame"),
  );
  if (!check || check.actual === null || check.actual === undefined) {
    return "unavailable";
  }
  return formatReportNumber(check.actual);
}

function formatFrameTiming(frameTiming) {
  return [frameTiming.p50, frameTiming.p95, frameTiming.p99, frameTiming.max]
    .map(formatReportNumber)
    .join("/");
}

function formatDeferredWorkByLane(deferredWorkByLane = {}) {
  const entries = Object.entries(deferredWorkByLane).filter(([, value]) => Number(value) > 0);
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([lane, value]) => `${lane}:${value}`).join(", ");
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
  const details = scenarioDiagnosticDetails(scenario);
  return `## ${scenario.scenario} / ${scenario.syntheticScene} / recording-${metadata.recordingEnabled}

- build: ${metadata.buildMode}
- seed: ${metadata.randomSeed}
- warm-up/repetitions: ${metadata.warmUpCount} / ${metadata.repetitionCount}
- viewport/DPR/refresh: ${metadata.viewportWidth}x${metadata.viewportHeight} / ${metadata.devicePixelRatio} / ${metadata.refreshRateEstimateHz}Hz
- recording/debug: ${metadata.recordingEnabled} / ${metadata.workflowGraphDebugEnabled}
- timing thresholds: ${metadata.timingThresholds}
- trace top tasks: ${traceTasks}
- interaction ids: ${formatInteractionIds(scenario)}
- timing: ${formatScenarioTimingDetails(scenario)}
- scene visits: ${formatSceneVisitCounterDetails(scenario)}
- supplemental render: ${formatSupplementalRenderMetrics(scenario)}
- DOM mutations by owner/source: ${formatOwnerSourceCounts(
    scenario.diagnostics.paneMutations?.countsByOwnerAndSource,
  )}
- React commits by owner/source: ${formatOwnerSourceCounts(
    scenario.diagnostics.reactCommits?.countsByOwnerAndSource,
  )}
- deferred work by lane: ${formatDeferredWorkByLane(scenario.diagnostics.deferredWorkByLane)}
- graph scene replacements: ${scenario.diagnostics.graphSceneReplacementCount ?? 0}
${details}

${checks}
`;
}

function scenarioDiagnosticDetails(scenario) {
  const supplemental = scenario.diagnostics.supplementalRenderMetrics ?? {};
  if (supplemental.drawCallSource !== "not-instrumented") {
    return "";
  }
  return "- draw calls: not instrumented in the current Pixi debug snapshot\n";
}

function formatInteractionIds(scenario) {
  const items = scenario.diagnostics.inputInteractions?.items ?? [];
  if (items.length === 0) {
    return "none";
  }
  return items
    .map((interaction) => `${interaction.kind}#${interaction.id}`)
    .slice(0, 16)
    .join(", ");
}

function formatScenarioTimingDetails(scenario) {
  const wheel = scenario.diagnostics.wheelLatency ?? {};
  return [
    `delivery p50/p95/max=${formatStats(wheel.eventDeliveryDelayMs)}`,
    `handler p95=${formatReportNumber(wheel.handlerDurationMs?.p95)}ms`,
    `camera commit p95=${formatReportNumber(wheel.cameraUpdateDurationMs?.p95)}ms`,
    `first Pixi render proxy p95=${formatReportNumber(
      wheel.eventTimestampToFirstPixiRenderAfterCameraMs?.p95,
    )}ms`,
    `input-to-presented=${formatInputToPresentedFrame(scenario)}`,
    `frame p50/p95/p99/max=${formatFrameTiming(scenario.diagnostics.frameTiming ?? {})}ms`,
  ].join("; ");
}

function formatStats(stats = {}) {
  return `${formatReportNumber(stats.p50)}/${formatReportNumber(stats.p95)}/${formatReportNumber(
    stats.max,
  )}ms`;
}

function formatSceneVisitCounterDetails(scenario) {
  const stats = sceneVisitCountersForScenario(scenario)?.cameraFrameSceneVisitStats;
  if (!stats?.counters) {
    return "missing";
  }
  return requiredSceneVisitCounterNames
    .map((counterName) => {
      const counter = stats.counters[counterName] ?? {};
      return `${counterName} p95=${formatReportNumber(counter.p95)}`;
    })
    .join(", ");
}

function formatSupplementalRenderMetrics(scenario) {
  const supplemental = scenario.diagnostics.supplementalRenderMetrics ?? {};
  const drawCalls =
    supplemental.drawCallCount === null || supplemental.drawCallCount === undefined
      ? "not-instrumented"
      : formatReportNumber(supplemental.drawCallCount);
  return `renderedObjects=${supplemental.renderedObjectCount ?? scenario.render.totalDisplayObjectCount}; drawCalls=${drawCalls}`;
}

function formatOwnerSourceCounts(counts = {}) {
  const entries = Object.entries(counts).sort((left, right) => Number(right[1]) - Number(left[1]));
  if (entries.length === 0) {
    return "none";
  }
  return entries
    .slice(0, 6)
    .map(([key, count]) => `${key}=${count}`)
    .join("; ");
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
