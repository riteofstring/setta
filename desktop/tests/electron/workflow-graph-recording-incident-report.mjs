#!/usr/bin/env node
/* global console */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const cameraInputKinds = new Set(["pointer-pan", "wheel", "wheel-burst"]);
const graphEventTypes = new Set([
  "graph_interaction",
  "graph_layout_save",
  "graph_replacement",
  "graph_snapshot",
]);
const incidentKinds = new Set([
  "graph_replacement",
  "node_drag",
  "pan_zoom",
  "selection",
  "sprite_click",
]);

export async function parseWorkflowGraphRecordingIncidentReport({
  artifactDir,
  failOnMissingEvidence = true,
  requiredIncidents = [],
}) {
  const resolvedArtifactDir = resolve(artifactDir);
  const artifacts = await readIncidentArtifacts(resolvedArtifactDir);
  const graphEvents = artifacts.rendererEvents.filter((event) => graphEventTypes.has(event.type));
  const incidents = [
    ...panZoomIncidents(artifacts, graphEvents),
    ...nodeDragIncidents(graphEvents),
    ...spriteClickIncidents(graphEvents),
    ...selectionIncidents(graphEvents),
    ...graphReplacementIncidents(graphEvents),
  ].sort(compareIncidentAt);
  const checks = incidentEvidenceChecks({
    artifacts,
    graphEvents,
    incidents,
    requiredIncidents,
  });
  const report = {
    artifactDir: resolvedArtifactDir,
    artifacts: artifactAvailability(artifacts),
    checks,
    generatedAt: new Date().toISOString(),
    incidents,
    reportKind: "workflow-graph-recording-incident-report",
    status: checks.every((check) => check.status === "pass") ? "passed" : "failed",
  };
  if (failOnMissingEvidence && report.status !== "passed") {
    throw new Error(workflowGraphIncidentFailureSummary(report));
  }
  return report;
}

export function workflowGraphRecordingIncidentReportMarkdown(report) {
  const checks = report.checks.map(formatCheck).join("\n") || "- no required evidence checks";
  const incidents = report.incidents.map(formatIncident).join("\n") || "- none";
  return `# Workflow Graph Recording Incident Report

- artifact dir: \`${report.artifactDir}\`
- status: ${report.status}
- generated: ${report.generatedAt}

## Checks

${checks}

## Incidents

${incidents}
`;
}

export async function writeWorkflowGraphRecordingIncidentReport({
  artifactDir,
  failOnMissingEvidence = true,
  jsonName = "workflow-graph-incident-report.json",
  markdownName = "workflow-graph-incident-report.md",
  requiredIncidents = [],
}) {
  const report = await parseWorkflowGraphRecordingIncidentReport({
    artifactDir,
    failOnMissingEvidence,
    requiredIncidents,
  });
  await writeOutput(join(artifactDir, jsonName), JSON.stringify(report, null, 2) + "\n");
  await writeOutput(
    join(artifactDir, markdownName),
    workflowGraphRecordingIncidentReportMarkdown(report),
  );
  return report;
}

function workflowGraphIncidentFailureSummary(report) {
  const failures = report.checks
    .filter((check) => check.status !== "pass")
    .map((check) => `${check.id}: ${check.summary}`);
  return `workflow graph recording incident evidence missing: ${failures.join("; ")}`;
}

async function readIncidentArtifacts(artifactDir) {
  return {
    artifactDir,
    debugSnapshots: await readNamedOrMatchingJson(artifactDir, "pan-zoom-debug-snapshots.json", [
      "-debug-snapshots.json",
    ]),
    inputSamples: await readNamedOrMatchingJson(artifactDir, "pan-zoom-input-samples.json", [
      "-input-samples.json",
    ]),
    performanceTimeline: await readNamedOrMatchingJson(
      artifactDir,
      "pan-zoom-performance-observer.json",
      ["-performance-observer.json"],
    ),
    rendererEvents: await readJsonLinesOptional(join(artifactDir, "renderer-events.jsonl")),
    traceSummary: await readNamedOrMatchingJson(artifactDir, "pan-zoom-cdp-trace-summary.json", [
      "-cdp-trace-summary.json",
    ]),
  };
}

async function readNamedOrMatchingJson(artifactDir, name, suffixes) {
  const named = await readJsonOptional(join(artifactDir, name));
  if (named !== null) {
    return named;
  }
  const entries = await readdir(artifactDir, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const match = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .find((entryName) => suffixes.some((suffix) => entryName.endsWith(suffix)));
  return match ? readJsonOptional(join(artifactDir, match)) : null;
}

async function readJsonOptional(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readJsonLinesOptional(path) {
  try {
    return (await readFile(path, "utf8"))
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function artifactAvailability(artifacts) {
  return {
    debugSnapshots: Array.isArray(artifacts.debugSnapshots) ? artifacts.debugSnapshots.length : 0,
    inputSamples: Array.isArray(artifacts.inputSamples) ? artifacts.inputSamples.length : 0,
    performanceTimeline: artifacts.performanceTimeline !== null,
    rendererGraphEvents: artifacts.rendererEvents.filter((event) => graphEventTypes.has(event.type))
      .length,
    traceSummary: artifacts.traceSummary !== null,
  };
}

function panZoomIncidents(artifacts, graphEvents) {
  const inputSamples = Array.isArray(artifacts.inputSamples) ? artifacts.inputSamples : [];
  const cameraSamples = inputSamples.filter((sample) => cameraInputKinds.has(sample.kind));
  const cameraTimings = cameraInputTimingWindows(artifacts.performanceTimeline);
  if (cameraSamples.length === 0 && cameraTimings.length === 0) {
    return [];
  }
  const snapshotVisibility = visibilityDropsFromDebugSnapshots(artifacts.debugSnapshots);
  const inputWindow = isoInputWindow(cameraSamples);
  return [
    {
      at: inputWindow.firstAt,
      causalWork: {
        cameraGraphReplacements: cameraGraphReplacementCount(graphEvents, inputWindow),
        cameraPaneMutations: cameraPaneMutationCount(artifacts.performanceTimeline),
        cameraReactCommits: cameraReactCommitCount(artifacts.performanceTimeline),
        renderDeltas: inputRenderDeltaSummary(cameraSamples),
      },
      input: {
        eventCount: cameraSamples.reduce((sum, sample) => sum + inputSampleEventCount(sample), 0),
        firstAt: inputWindow.firstAt,
        kinds: countBy(cameraSamples, (sample) => sample.kind),
        lastAt: inputWindow.lastAt,
      },
      kind: "pan_zoom",
      summary: `camera inputs=${cameraSamples.length}; longTasks=${
        overlappingLongTasks(artifacts.performanceTimeline, cameraTimings).length
      }; visibilityDrops=${snapshotVisibility.drops.length}`,
      timing: {
        longTasks: overlappingLongTasks(artifacts.performanceTimeline, cameraTimings),
        traceTopTasks: traceTopTasks(artifacts.traceSummary),
        userTimings: overlappingUserTimings(artifacts.performanceTimeline, cameraTimings),
      },
      visibilityDrops: snapshotVisibility.drops,
      visibilityStart: snapshotVisibility.before,
      visibilityEnd: snapshotVisibility.after,
    },
  ];
}

function nodeDragIncidents(graphEvents) {
  const interactions = graphEvents.filter(
    (event) => event.type === "graph_interaction" && event.interaction?.kind === "node_drag",
  );
  const terminals = interactions.filter((event) =>
    ["blocked", "cancel", "commit"].includes(event.interaction.phase),
  );
  return terminals.map((event, index) => {
    const movedNodeIds = new Set((event.interaction.movedNodes ?? []).map((node) => node.nodeId));
    return {
      at: event.at,
      kind: "node_drag",
      layoutSaves: layoutSavesForMovedNodes(graphEvents, movedNodeIds, event.at),
      movementOwner: event.interaction.movementOwner,
      movedNodes: event.interaction.movedNodes ?? [],
      phase: event.interaction.phase,
      reason: event.interaction.reason,
      summary: `phase=${event.interaction.phase}; movedNodes=${
        event.interaction.movedNodes?.length ?? 0
      }; owner=${event.interaction.movementOwner || "none"}`,
      touchedNodeIds: event.interaction.affectedNodeIds ?? [],
      visibility: event.graph?.visibility ?? null,
      sequence: index + 1,
    };
  });
}

function layoutSavesForMovedNodes(graphEvents, movedNodeIds, sinceAt) {
  if (movedNodeIds.size === 0) {
    return [];
  }
  const since = Date.parse(sinceAt);
  return graphEvents
    .filter((event) => event.type === "graph_layout_save")
    .filter((event) => !Number.isFinite(since) || Date.parse(event.at ?? "") >= since)
    .filter((event) =>
      (event.layoutSave?.affectedNodeIds ?? []).some((nodeId) => movedNodeIds.has(nodeId)),
    )
    .map((event) => ({
      affectedNodeIds: event.layoutSave.affectedNodeIds,
      error: event.layoutSave.error,
      generation: event.layoutSave.generation,
      owner: event.layoutSave.owner,
      owners: event.layoutSave.owners,
      phase: event.layoutSave.phase,
      status: event.layoutSave.status,
    }));
}

function spriteClickIncidents(graphEvents) {
  const interactions = graphEvents.filter(
    (event) => event.type === "graph_interaction" && event.interaction?.kind === "activity_sprite",
  );
  const taps = interactions.filter((event) => event.interaction.reason === "pointertap");
  return taps.map((tap, index) => {
    const detailsLink = interactions.find(
      (event) =>
        event.interaction.reason === "details_link" &&
        event.interaction.spriteId === tap.interaction.spriteId &&
        event.interaction.spriteRunItemId === tap.interaction.spriteRunItemId,
    );
    return {
      at: tap.at,
      detailsLink: detailsLink
        ? {
            at: detailsLink.at,
            targetNodeId: detailsLink.interaction.targetNodeId,
          }
        : null,
      kind: "sprite_click",
      popoverRunItemId: tap.interaction.popoverRunItemId,
      spriteChatRunId: tap.interaction.spriteChatRunId,
      spriteId: tap.interaction.spriteId,
      spriteRunItemId: tap.interaction.spriteRunItemId,
      summary: `sprite=${tap.interaction.spriteId}; runItem=${tap.interaction.spriteRunItemId}; detailsLink=${
        detailsLink ? "yes" : "no"
      }`,
      targetNodeId: tap.interaction.targetNodeId || tap.interaction.sourceNodeId,
      visibility: tap.graph?.visibility ?? null,
      sequence: index + 1,
    };
  });
}

function selectionIncidents(graphEvents) {
  return graphEvents
    .filter(
      (event) => event.type === "graph_interaction" && event.interaction?.kind === "selection",
    )
    .map(selectionIncident);
}

function selectionIncident(event, index) {
  const selected = graphSelectedState(event.graph);
  return {
    at: event.at,
    kind: "selection",
    selectedEdgeIds: selected.edgeIds,
    selectedNodeIds: selected.nodeIds,
    summary: selectionIncidentSummary(event.interaction, selected.nodeIds.length),
    touchedNodeIds: event.interaction.affectedNodeIds,
    visibility: graphVisibility(event.graph),
    sequence: index + 1,
  };
}

function graphSelectedState(graph) {
  if (!graph || !graph.selected) {
    return { edgeIds: [], nodeIds: [] };
  }
  return graph.selected;
}

function graphVisibility(graph) {
  return graph?.visibility ?? null;
}

function selectionIncidentSummary(interaction, selectedNodeCount) {
  return `selectedNodes=${selectedNodeCount}; reason=${interaction.reason}`;
}

function graphReplacementIncidents(graphEvents) {
  return graphEvents
    .filter((event) => event.type === "graph_replacement")
    .map((event, index) => ({
      activeInteraction: event.replacement.activeInteraction,
      at: event.at,
      graphVersion: event.replacement.graphVersion,
      kind: "graph_replacement",
      phase: event.replacement.phase,
      reason: event.replacement.reason,
      summary: `phase=${event.replacement.phase}; reason=${event.replacement.reason}; active=${event.replacement.activeInteraction}`,
      visibility: event.graph?.visibility ?? null,
      sequence: index + 1,
    }));
}

function incidentEvidenceChecks({ artifacts, graphEvents, incidents, requiredIncidents }) {
  const required = normalizeRequiredIncidents(requiredIncidents);
  const checks = [];
  for (const kind of required) {
    const matching = incidents.filter((incident) => incident.kind === kind);
    checks.push(
      evidenceCheck({
        id: `required-${kind}-incident`,
        pass: matching.length > 0,
        summary: `incidents=${matching.length}`,
      }),
    );
  }
  if (required.has("pan_zoom")) {
    checks.push(
      evidenceCheck({
        id: "pan-zoom-performance-timeline-present",
        pass: artifacts.performanceTimeline !== null,
        summary: `performanceTimeline=${artifacts.performanceTimeline !== null}`,
      }),
    );
  }
  if (required.has("node_drag")) {
    checks.push(nodeDragMovedNodeEvidenceCheck(incidents));
    checks.push(nodeDragLayoutSaveEvidenceCheck(incidents));
  }
  if (required.has("sprite_click")) {
    checks.push(spriteClickTargetEvidenceCheck(incidents));
  }
  if (required.size > 0) {
    checks.push(visibilityEvidenceCheck(graphEvents));
  }
  return checks;
}

function normalizeRequiredIncidents(requiredIncidents) {
  const values = Array.isArray(requiredIncidents) ? requiredIncidents : [...requiredIncidents];
  for (const value of values) {
    if (!incidentKinds.has(value)) {
      throw new Error(`unsupported workflow graph incident kind: ${value}`);
    }
  }
  return new Set(values);
}

function nodeDragMovedNodeEvidenceCheck(incidents) {
  const commits = incidents.filter(
    (incident) => incident.kind === "node_drag" && incident.phase === "commit",
  );
  const missing = commits.filter((incident) => (incident.movedNodes ?? []).length === 0);
  return evidenceCheck({
    id: "node-drag-moved-node-positions-present",
    pass: commits.length > 0 && missing.length === 0,
    summary: `commitIncidents=${commits.length}, missingMovedNodes=${missing.length}`,
  });
}

function nodeDragLayoutSaveEvidenceCheck(incidents) {
  const movedCommits = incidents.filter(
    (incident) =>
      incident.kind === "node_drag" &&
      incident.phase === "commit" &&
      (incident.movedNodes ?? []).length > 0,
  );
  const durableMovedCommits = movedCommits.filter((incident) =>
    durableMovementOwner(incident.movementOwner),
  );
  const missing = durableMovedCommits.filter(
    (incident) => (incident.layoutSaves ?? []).length === 0,
  );
  return evidenceCheck({
    id: "node-drag-layout-save-outcomes-present",
    pass: movedCommits.length > 0 && missing.length === 0,
    summary: `movedCommits=${movedCommits.length}, durableMovedCommits=${durableMovedCommits.length}, missingLayoutSaveOutcomes=${missing.length}`,
  });
}

function durableMovementOwner(owner) {
  return ["semantic_layout", "workflow_definition_layout", "workflow_view_layout"].includes(owner);
}

function spriteClickTargetEvidenceCheck(incidents) {
  const clicks = incidents.filter((incident) => incident.kind === "sprite_click");
  const missing = clicks.filter(
    (incident) =>
      !incident.spriteId ||
      !incident.spriteRunItemId ||
      !incident.popoverRunItemId ||
      incident.detailsLink === null,
  );
  return evidenceCheck({
    id: "sprite-click-targets-present",
    pass: clicks.length > 0 && missing.length === 0,
    summary: `clickIncidents=${clicks.length}, missingTargets=${missing.length}`,
  });
}

function visibilityEvidenceCheck(graphEvents) {
  const eventsWithGraph = graphEvents.filter((event) => event.graph);
  const missing = eventsWithGraph.filter((event) => !event.graph.visibility);
  return evidenceCheck({
    id: "graph-visibility-reasons-present",
    pass: eventsWithGraph.length > 0 && missing.length === 0,
    summary: `graphEvents=${eventsWithGraph.length}, missingVisibility=${missing.length}`,
  });
}

function evidenceCheck({ id, pass, summary }) {
  return {
    id,
    status: pass ? "pass" : "fail",
    summary,
  };
}

function cameraInputTimingWindows(performanceTimeline) {
  const completedInputs = performanceTimeline?.completedInputs ?? [];
  if (completedInputs.length > 0) {
    return completedInputs
      .filter((input) => input.cameraInput === true)
      .map(cameraInputTimingWindowFromCompletedInput)
      .filter((window) => Number.isFinite(window.startTime));
  }
  const userTimings = performanceTimeline?.userTimings ?? [];
  const endsByToken = new Map(
    userTimings
      .filter((entry) => entry.name === "setta.workflow-graph.input.end")
      .map((entry) => [entry.detail?.token, entry]),
  );
  return userTimings
    .filter((entry) => entry.name === "setta.workflow-graph.input.start")
    .filter((entry) => entry.detail?.cameraInput === true)
    .map((start) => cameraInputTimingWindow(start, endsByToken))
    .filter((window) => Number.isFinite(window.startTime));
}

function cameraInputTimingWindowFromCompletedInput(input) {
  const startTime = finiteNumber(input.startedAt, input.startTime);
  const endTime = finiteNumber(input.endedAt, input.endTime, startTime);
  return {
    causalSource: input.causalSource ?? "",
    endTime,
    kind: input.kind ?? "",
    startTime,
    token: input.token ?? null,
  };
}

function cameraInputTimingWindow(start, endsByToken) {
  const detail = performanceEntryDetail(start);
  const end = endsByToken.get(detail.token);
  const startTime = finiteNumber(start.startTime, detail.startedAt);
  const endTime = performanceEntryEndTime(end);
  return {
    causalSource: detail.causalSource ?? "",
    endTime: endTime ?? startTime,
    kind: detail.kind ?? "",
    startTime,
    token: detail.token ?? null,
  };
}

function performanceEntryDetail(entry) {
  return entry?.detail ?? {};
}

function performanceEntryEndTime(entry) {
  if (!entry) {
    return null;
  }
  return finiteNumber(entry.startTime, performanceEntryDetail(entry).endedAt);
}

function overlappingLongTasks(performanceTimeline, windows) {
  return overlappingEntries(performanceTimeline?.longTasks ?? [], windows)
    .map(compactPerformanceEntry)
    .slice(0, 12);
}

function overlappingUserTimings(performanceTimeline, windows) {
  return overlappingEntries(performanceTimeline?.userTimings ?? [], windows)
    .filter((entry) => !entry.name?.startsWith("setta.workflow-graph.input."))
    .map(compactPerformanceEntry)
    .slice(0, 16);
}

function overlappingEntries(entries, windows) {
  if (windows.length === 0) {
    return [];
  }
  return entries.filter((entry) =>
    windows.some((window) =>
      rangesOverlap(
        entry.startTime,
        entry.startTime + Number(entry.duration ?? 0),
        window.startTime,
        window.endTime,
      ),
    ),
  );
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  if (![leftStart, leftEnd, rightStart, rightEnd].every(Number.isFinite)) {
    return false;
  }
  return leftStart < rightEnd && rightStart < leftEnd;
}

function compactPerformanceEntry(entry) {
  return {
    durationMs: round(entry.duration ?? 0),
    name: entry.name ?? "",
    startTime: round(entry.startTime ?? 0),
  };
}

function traceTopTasks(traceSummary) {
  const summary = traceSummary ?? {};
  return [...(summary.topLevelTasks ?? []), ...(summary.topCompleteEvents ?? [])]
    .filter((event) => Number.isFinite(Number(event.durationMs)))
    .sort((left, right) => Number(right.durationMs) - Number(left.durationMs))
    .slice(0, 8)
    .map((event) => ({
      category: event.category ?? "",
      durationMs: round(event.durationMs),
      name: event.name ?? "",
    }));
}

function visibilityDropsFromDebugSnapshots(debugSnapshots) {
  if (!Array.isArray(debugSnapshots) || debugSnapshots.length === 0) {
    return { after: null, before: null, drops: [] };
  }
  const before = debugSnapshotVisibility(debugSnapshots[0]?.snapshot ?? debugSnapshots[0]);
  const after = debugSnapshotVisibility(debugSnapshots.at(-1)?.snapshot ?? debugSnapshots.at(-1));
  return {
    after,
    before,
    drops: visibilityDrops(before, after),
  };
}

function debugSnapshotVisibility(snapshot) {
  const render = snapshot?.render ?? {};
  const graph = snapshot?.graph ?? {};
  return {
    edges: debugEdgeVisibility(graph, render),
    labels: debugLabelVisibility(graph, render),
    nodes: debugNodeVisibility(graph, render),
    sprites: debugSpriteVisibility(render),
  };
}

function debugEdgeVisibility(graph, render) {
  return {
    reason: "last-drawn-edge-count",
    total: Number(graph.edgeCount ?? 0),
    visible: Number(render.lastDrawnEdgeCount ?? 0),
  };
}

function debugLabelVisibility(graph, render) {
  return {
    reason: labelVisibilityReasonSummary(graph.nodes),
    total: Number(render.materializedLabelCount ?? graph.nodeCount ?? 0),
    visible: Number(render.visibleLabelCount ?? render.materializedLabelCount ?? 0),
  };
}

function debugNodeVisibility(graph, render) {
  return {
    reason: "last-visible-materialized-node-count",
    total: Number(render.materializedNodeCount ?? graph.nodeCount ?? 0),
    visible: Number(render.lastVisibleMaterializedNodeCount ?? render.materializedNodeCount ?? 0),
  };
}

function debugSpriteVisibility(render) {
  return {
    reason: "trajectory-sprite-display-count",
    total: Number(render.trajectorySpriteTotalCount ?? 0),
    visible: Number(render.trajectorySpriteDisplayCount ?? 0),
  };
}

function labelVisibilityReasonSummary(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return "visible-label-count";
  }
  const hiddenReasons = countBy(
    nodes.filter((node) => node.label?.visible === false),
    (node) => node.label?.visibilityReason || "unknown",
  );
  return Object.entries(hiddenReasons)
    .map(([reason, count]) => `${reason}:${count}`)
    .join(", ");
}

function visibilityDrops(before, after) {
  if (before === null || after === null) {
    return [];
  }
  return Object.keys(before)
    .filter((key) => Number(after[key]?.visible ?? 0) < Number(before[key]?.visible ?? 0))
    .map((key) => ({
      category: key,
      from: before[key].visible,
      reason: after[key].reason,
      to: after[key].visible,
    }));
}

function isoInputWindow(samples) {
  const timestamps = samples
    .map((sample) => Date.parse(sample.at ?? ""))
    .filter((timestamp) => Number.isFinite(timestamp));
  if (timestamps.length === 0) {
    return { firstAt: "", lastAt: "" };
  }
  return {
    firstAt: new Date(Math.min(...timestamps)).toISOString(),
    lastAt: new Date(Math.max(...timestamps)).toISOString(),
  };
}

function inputRenderDeltaSummary(samples) {
  const totals = {};
  for (const sample of samples) {
    for (const [counter, value] of Object.entries(sample.renderDeltas ?? {})) {
      if (Number(value) !== 0) {
        totals[counter] = (totals[counter] ?? 0) + Number(value);
      }
    }
  }
  return totals;
}

function cameraGraphReplacementCount(graphEvents, inputWindow) {
  const window = parsedIsoWindow(inputWindow);
  return graphEvents.filter((event) => {
    if (event.type !== "graph_replacement") {
      return false;
    }
    if (event.replacement?.activeInteraction === "camera") {
      return true;
    }
    return window === null ? false : rowInWindow(event, window);
  }).length;
}

function cameraPaneMutationCount(performanceTimeline) {
  return (performanceTimeline?.paneMutations ?? []).filter((mutation) =>
    String(mutation.causalSource ?? "").startsWith("camera:"),
  ).length;
}

function cameraReactCommitCount(performanceTimeline) {
  return (performanceTimeline?.reactCommits ?? []).filter((commit) =>
    String(commit.causalSource ?? "").startsWith("camera:"),
  ).length;
}

function parsedIsoWindow(inputWindow) {
  const first = Date.parse(inputWindow.firstAt ?? "");
  const last = Date.parse(inputWindow.lastAt ?? "");
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return null;
  }
  return { first, last: last + 1000 };
}

function rowInWindow(row, window) {
  const timestamp = Date.parse(row.at ?? "");
  return Number.isFinite(timestamp) && timestamp >= window.first && timestamp <= window.last;
}

function inputSampleEventCount(sample) {
  if (sample.kind === "wheel-burst") {
    return sample.dispatched?.length ?? 0;
  }
  if (sample.kind === "pointer-select") {
    return 3;
  }
  return 1;
}

function countBy(values, key) {
  const counts = {};
  for (const value of values) {
    const countKey = key(value) || "unknown";
    counts[countKey] = (counts[countKey] ?? 0) + 1;
  }
  return counts;
}

function compareIncidentAt(left, right) {
  return String(left.at ?? "").localeCompare(String(right.at ?? ""));
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return null;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
}

function formatCheck(check) {
  return `- ${check.status} ${check.id}: ${check.summary}`;
}

function formatIncident(incident) {
  switch (incident.kind) {
    case "graph_replacement":
      return `- Graph replacement ${incident.at}: ${incident.summary}`;
    case "node_drag":
      return `- Node drag ${incident.at}: ${incident.summary}; saves=${formatLayoutSaves(
        incident.layoutSaves,
      )}`;
    case "pan_zoom":
      return `- Pan/zoom ${incident.at || "unknown"}: ${incident.summary}; topTask=${formatTopTask(
        incident.timing.traceTopTasks[0],
      )}`;
    case "selection":
      return `- Selection ${incident.at}: ${incident.summary}`;
    case "sprite_click":
      return `- Sprite click ${incident.at}: ${incident.summary}`;
    default:
      return `- ${incident.kind} ${incident.at}: ${incident.summary ?? ""}`;
  }
}

function formatLayoutSaves(layoutSaves) {
  if (!Array.isArray(layoutSaves) || layoutSaves.length === 0) {
    return "none";
  }
  return layoutSaves.map((save) => `${save.phase}:${save.status}:${save.owner}`).join(", ");
}

function formatTopTask(task) {
  if (!task) {
    return "none";
  }
  return `${task.name} ${task.durationMs}ms`;
}

function parseArgs(args) {
  const parsed = {
    artifactDir: "",
    failOnMissingEvidence: true,
    help: false,
    jsonOut: "",
    markdownOut: "",
    requiredIncidents: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--artifact-dir":
        parsed.artifactDir = resolve(requiredValue(args, index, arg));
        index += 1;
        break;
      case "--json-out":
        parsed.jsonOut = resolve(requiredValue(args, index, arg));
        index += 1;
        break;
      case "--markdown-out":
        parsed.markdownOut = resolve(requiredValue(args, index, arg));
        index += 1;
        break;
      case "--require":
        parsed.requiredIncidents = requiredValue(args, index, arg)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        index += 1;
        break;
      case "--allow-missing":
        parsed.failOnMissingEvidence = false;
        break;
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      default:
        throw new Error(`unknown workflow graph incident report argument: ${arg}`);
    }
  }
  return parsed;
}

function requiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      `Usage: node ${basename(process.argv[1])} --artifact-dir <dir> [--require pan_zoom,node_drag,selection,sprite_click,graph_replacement] [--allow-missing] [--json-out <path>] [--markdown-out <path>]`,
    );
    return;
  }
  if (!options.artifactDir) {
    throw new Error("--artifact-dir is required");
  }
  const report = await parseWorkflowGraphRecordingIncidentReport(options);
  const markdown = workflowGraphRecordingIncidentReportMarkdown(report);
  if (options.jsonOut) {
    await writeOutput(options.jsonOut, JSON.stringify(report, null, 2) + "\n");
  }
  if (options.markdownOut) {
    await writeOutput(options.markdownOut, markdown);
  }
  if (!options.jsonOut && !options.markdownOut) {
    process.stdout.write(markdown);
  }
}

async function writeOutput(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
