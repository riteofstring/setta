import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";

import { writeJson } from "./electron-cdp-harness.mjs";

export const semanticRuntimeTrafficBudgets = {
  maxBlankScopeWorkingSetReads: 0,
  maxRuntimeDeltaPayloadBytes: 32 * 1024,
  maxRuntimeIpcBytesPerMinute: 1_000_000,
  maxRuntimePayloadBytesPerMinute: 1_000_000,
  maxRuntimeSnapshotPayloadBytes: 96 * 1024,
};

export async function assertSemanticRuntimeTrafficContract(
  recordingDir,
  { reportName = "semantic-runtime-traffic-gate.json", workflowLabel = "semantic-runtime" } = {},
) {
  const [ipcRows, backendRows, eventRows] = await Promise.all([
    readJsonLinesWithRaw(join(recordingDir, "ipc.jsonl")),
    readJsonLinesWithRaw(join(recordingDir, "backend-http.jsonl")),
    readJsonLinesWithRaw(join(recordingDir, "events.jsonl")),
  ]);
  const report = semanticRuntimeTrafficReport({
    backendRows,
    eventRows,
    ipcRows,
    recordingDir,
    workflowLabel,
  });
  await writeJson(join(recordingDir, reportName), report);
  const failures = report.checks
    .filter((check) => check.status !== "pass")
    .map((check) => `${check.id}: actual=${check.actual} budget=${check.budget}`);
  if (failures.length > 0) {
    throw new Error(`${workflowLabel} runtime traffic contract failed: ${failures.join("; ")}`);
  }
  return report;
}

export async function readJsonLinesWithRaw(path) {
  const raw = await readFile(path, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => ({
      bytes: Buffer.byteLength(line) + 1,
      row: JSON.parse(line),
    }));
}

export function semanticRuntimeTrafficReport({
  backendRows,
  eventRows,
  ipcRows,
  recordingDir,
  workflowLabel,
}) {
  const metrics = semanticRuntimeTrafficMetrics({ backendRows, eventRows, ipcRows });
  const checks = semanticRuntimeTrafficChecks(metrics, workflowLabel);
  return {
    budgets: semanticRuntimeTrafficBudgets,
    checks,
    generatedAt: new Date().toISOString(),
    metrics,
    recordingDir,
    status: checks.every((check) => check.status === "pass") ? "passed" : "failed",
    workflowLabel,
  };
}

function semanticRuntimeTrafficMetrics({ backendRows, eventRows, ipcRows }) {
  const blankScopeIpcIds = blankScopeWorkingSetIpcIds(ipcRows);
  const runtimeSnapshotIpcFinishes = ipcRows.filter(
    ({ row }) => row.type === "ipc_finish" && row.channel === "semantic-graph:runtime-snapshot",
  );
  const runtimeSnapshotPayloadSizes = runtimeSnapshotIpcFinishes.map(({ row }) =>
    jsonPayloadByteSize(row.result),
  );
  const runtimeSnapshotPayloadBytes = sum(runtimeSnapshotPayloadSizes);
  const runtimeSnapshotPayloadBudgetBytes =
    maxOrZero(
      runtimeSnapshotIpcFinishes.map(({ row }) =>
        Number(row.result?.payloadBudget?.maxByteSize ?? 0),
      ),
    ) || semanticRuntimeTrafficBudgets.maxRuntimeSnapshotPayloadBytes;
  const runtimeSnapshotBootstrapAt = runtimeSnapshotIpcFinishes[0]?.row.at ?? "";
  const semanticEventRows = eventRows.filter(
    ({ row }) => row.type === "semantic_graph_event_forwarded",
  );
  const runtimeDeltaPayloadSizes = semanticEventRows
    .map(({ row }) => Number(row.payload?.semanticRuntimeDeltaBytes ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const runtimeDeltaPayloadBytes = sum(runtimeDeltaPayloadSizes);
  const runtimeDeltaPayloadBudgetBytes =
    maxOrZero(
      semanticEventRows.map(({ row }) => Number(row.payload?.semanticRuntimeDeltaMaxBytes ?? 0)),
    ) || semanticRuntimeTrafficBudgets.maxRuntimeDeltaPayloadBytes;
  const workingSetIpcStarts = ipcRows.filter(
    ({ row }) => row.type === "ipc_start" && row.channel === "semantic-graph:working-set-read",
  );
  const workingSetIpcBytes = ipcRows
    .filter(({ row }) => row.channel === "semantic-graph:working-set-read")
    .filter(({ row }) => blankScopeIpcIds.has(row.id))
    .reduce((total, { bytes }) => total + bytes, 0);
  const runtimeSnapshotIpcBytes = ipcRows
    .filter(({ row }) => row.channel === "semantic-graph:runtime-snapshot")
    .reduce((total, { bytes }) => total + bytes, 0);
  const rawDurationMinutes = recordingDurationMinutes([...ipcRows, ...backendRows, ...eventRows]);
  const rateWindowMinutes = Math.max(rawDurationMinutes, 1);
  const blankScopeWorkingSetReadCount = workingSetIpcStarts.filter(({ row }) =>
    blankScopeIpcIds.has(row.id),
  ).length;
  const blankScopeWorkingSetReadAfterBootstrapCount = workingSetIpcStarts.filter(
    ({ row }) => blankScopeIpcIds.has(row.id) && rowIsAtOrAfter(row, runtimeSnapshotBootstrapAt),
  ).length;
  const blankScopeWorkingSetHttpRequestCount = backendRows.filter(
    ({ row }) =>
      row.type === "backend_http_request" &&
      backendRowPath(row) === "/semantic-graph/working-set/read" &&
      workingSetRequestBodyIsBlankScope(row.requestBody),
  ).length;
  const blankScopeWorkingSetHttpRequestAfterBootstrapCount = backendRows.filter(
    ({ row }) =>
      row.type === "backend_http_request" &&
      backendRowPath(row) === "/semantic-graph/working-set/read" &&
      workingSetRequestBodyIsBlankScope(row.requestBody) &&
      rowIsAtOrAfter(row, runtimeSnapshotBootstrapAt),
  ).length;
  const runtimePayloadBytesPerMinute =
    (runtimeSnapshotPayloadBytes + runtimeDeltaPayloadBytes) / rateWindowMinutes;
  return {
    blankScopeWorkingSetHttpRequestAfterBootstrapCount,
    blankScopeWorkingSetHttpRequestCount,
    blankScopeWorkingSetReadAfterBootstrapCount,
    blankScopeWorkingSetReadCount,
    rateWindowMinutes,
    rawDurationMinutes,
    runtimeDeltaMaxPayloadBytes: maxOrZero(runtimeDeltaPayloadSizes),
    runtimeDeltaPayloadBudgetBytes,
    runtimeDeltaPayloadBytes,
    runtimeDeltaPayloadBytesPerMinute: runtimeDeltaPayloadBytes / rateWindowMinutes,
    runtimePayloadBytesPerMinute,
    runtimeSnapshotBootstrapAt,
    runtimeSnapshotIpcBytes,
    runtimeSnapshotIpcBytesPerMinute: runtimeSnapshotIpcBytes / rateWindowMinutes,
    runtimeSnapshotIpcReadCount: runtimeSnapshotIpcFinishes.length,
    runtimeSnapshotMaxPayloadBytes: maxOrZero(runtimeSnapshotPayloadSizes),
    runtimeSnapshotPayloadBudgetBytes,
    runtimeSnapshotPayloadBytes,
    runtimeSnapshotPayloadBytesPerMinute: runtimeSnapshotPayloadBytes / rateWindowMinutes,
    runtimeSnapshotPayloadRecorded: runtimeSnapshotPayloadSizes.length > 0,
    scopedWorkingSetReadCount: workingSetIpcStarts.length - blankScopeWorkingSetReadCount,
    semanticEventCount: semanticEventRows.length,
    workingSetIpcBytes,
    workingSetIpcBytesPerMinute: workingSetIpcBytes / rateWindowMinutes,
    workingSetIpcReadCount: workingSetIpcStarts.length,
  };
}

function semanticRuntimeTrafficChecks(metrics, workflowLabel) {
  return [
    hardBudgetCheck({
      actual: metrics.runtimeSnapshotIpcReadCount,
      budget: 1,
      id: `${workflowLabel}-runtime-snapshot-bootstrap-recorded`,
      pass: metrics.runtimeSnapshotIpcReadCount > 0,
    }),
    hardBudgetCheck({
      actual: metrics.blankScopeWorkingSetReadAfterBootstrapCount,
      budget: semanticRuntimeTrafficBudgets.maxBlankScopeWorkingSetReads,
      id: `${workflowLabel}-blank-scope-working-set-reads-after-runtime-bootstrap`,
      pass:
        metrics.blankScopeWorkingSetReadAfterBootstrapCount <=
        semanticRuntimeTrafficBudgets.maxBlankScopeWorkingSetReads,
    }),
    hardBudgetCheck({
      actual: metrics.blankScopeWorkingSetHttpRequestAfterBootstrapCount,
      budget: semanticRuntimeTrafficBudgets.maxBlankScopeWorkingSetReads,
      id: `${workflowLabel}-blank-scope-working-set-http-requests-after-runtime-bootstrap`,
      pass:
        metrics.blankScopeWorkingSetHttpRequestAfterBootstrapCount <=
        semanticRuntimeTrafficBudgets.maxBlankScopeWorkingSetReads,
    }),
    hardBudgetCheck({
      actual: Math.round(metrics.runtimeSnapshotIpcBytesPerMinute),
      budget: semanticRuntimeTrafficBudgets.maxRuntimeIpcBytesPerMinute,
      id: `${workflowLabel}-runtime-snapshot-ipc-bytes-per-minute`,
      pass:
        metrics.runtimeSnapshotIpcBytesPerMinute <
        semanticRuntimeTrafficBudgets.maxRuntimeIpcBytesPerMinute,
    }),
    hardBudgetCheck({
      actual: metrics.runtimeSnapshotMaxPayloadBytes,
      budget: metrics.runtimeSnapshotPayloadBudgetBytes,
      id: `${workflowLabel}-runtime-snapshot-hot-path-payload-bytes`,
      pass:
        metrics.runtimeSnapshotPayloadRecorded &&
        metrics.runtimeSnapshotMaxPayloadBytes <= metrics.runtimeSnapshotPayloadBudgetBytes,
    }),
    hardBudgetCheck({
      actual: metrics.runtimeDeltaMaxPayloadBytes,
      budget: metrics.runtimeDeltaPayloadBudgetBytes,
      id: `${workflowLabel}-runtime-delta-hot-path-payload-bytes`,
      pass: metrics.runtimeDeltaMaxPayloadBytes <= metrics.runtimeDeltaPayloadBudgetBytes,
    }),
    hardBudgetCheck({
      actual: Math.round(metrics.runtimePayloadBytesPerMinute),
      budget: semanticRuntimeTrafficBudgets.maxRuntimePayloadBytesPerMinute,
      id: `${workflowLabel}-runtime-hot-path-payload-bytes-per-minute`,
      pass:
        metrics.runtimePayloadBytesPerMinute <
        semanticRuntimeTrafficBudgets.maxRuntimePayloadBytesPerMinute,
    }),
  ];
}

function workingSetRequestBodyIsBlankScope(requestBody) {
  if (typeof requestBody !== "string" || requestBody === "") {
    return false;
  }
  return workingSetRequestIsBlankScope(JSON.parse(requestBody));
}

function workingSetRequestIsBlankScope(request) {
  return request?.workflowExecutionId === "" && request?.chatRunId === "";
}

function blankScopeWorkingSetIpcIds(ipcRows) {
  const ids = new Set();
  for (const { row } of ipcRows) {
    if (
      row.type === "ipc_start" &&
      row.channel === "semantic-graph:working-set-read" &&
      workingSetRequestIsBlankScope(row.args?.[0])
    ) {
      ids.add(row.id);
    }
  }
  return ids;
}

function rowIsAtOrAfter(row, timestampValue) {
  const rowTimestamp = Date.parse(row.at ?? "");
  const threshold = Date.parse(timestampValue);
  return Number.isFinite(rowTimestamp) && Number.isFinite(threshold) && rowTimestamp >= threshold;
}

function backendRowPath(row) {
  return new URL(row.url).pathname;
}

function recordingDurationMinutes(rows) {
  const timestamps = rows
    .map(({ row }) => Date.parse(row.at ?? ""))
    .filter((timestamp) => Number.isFinite(timestamp));
  if (timestamps.length === 0) {
    throw new Error("recording rows did not include timestamps");
  }
  return Math.max((Math.max(...timestamps) - Math.min(...timestamps)) / 60_000, 1 / 60);
}

function jsonPayloadByteSize(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  return Buffer.byteLength(JSON.stringify(value));
}

function maxOrZero(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length === 0 ? 0 : Math.max(...finite);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function hardBudgetCheck({ actual, budget, id, pass }) {
  return {
    actual,
    budget,
    id,
    severity: "hard",
    status: pass ? "pass" : "fail",
  };
}
