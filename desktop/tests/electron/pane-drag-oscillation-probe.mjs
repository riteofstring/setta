#!/usr/bin/env node
/* global console */

// TEMPORARY diagnostic probe (not a CI test). Drives a real pane drag with many
// fine-grained pointer moves and samples the resolved drop target + preview
// counters per step, to confirm/deny the "reflow feedback loop" oscillation
// hypothesis behind the drag jank. Safe to delete.

import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;
const viewport = { deviceScaleFactor: 1, height: 900, mobile: false, width: 1440 };
const artifactDir = options.artifactDir || timestampedRecordingDir("pane-drag-oscillation-probe");
const fixture = await createElectronFixture("pane-drag-oscillation-probe");
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    fixture,
    visible: options.visible,
  });
  const { client } = context;
  await client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await ensureWorkspaceOpen(client);
  let scene = await waitForNormalPaneHosts(client, 4);

  // Build a stacked column so a drag into it must reflow several siblings.
  const stackSeed = scene.focusedPaneId;
  for (let i = 0; i < 2; i += 1) {
    await clickPaneAction(client, currentFocused(scene) ?? stackSeed, "split-down");
    scene = await waitForState(
      client,
      paneSnapshotExpression(),
      (snap) => snap.mode === "normal" && snap.visibleHosts.length >= 4,
      workflowTimeoutMs,
    );
    await delay(120);
  }
  scene = await waitForNormalPaneHosts(client, 4);

  const columns = clusterColumns(scene.visibleHosts);
  const targetColumn = columns.toSorted((a, b) => b.panes.length - a.panes.length)[0];
  const source =
    scene.visibleHosts.find((h) => !targetColumn.panes.some((p) => p.paneId === h.paneId)) ??
    scene.visibleHosts.find((h) => h.paneId !== targetColumn.panes[0].paneId);
  if (!source || targetColumn.panes.length < 2) {
    throw new Error(
      `probe needs a stacked target column + outside source: ${JSON.stringify({ columns: columns.map((c) => c.panes.length) })}`,
    );
  }

  const colX = targetColumn.panes[0].rect.left + targetColumn.panes[0].rect.width / 2;
  const top = targetColumn.panes[0].rect.top + 10;
  const bottom = targetColumn.panes.at(-1).rect.top + targetColumn.panes.at(-1).rect.height - 10;

  await captureScreenshot(client, join(artifactDir, "00-before.png"));
  const from = await dragHandleCenter(client, source.paneId);
  await resetFrameMetrics(client);
  await pressMouse(client, from);
  await moveMouse(client, { x: colX, y: top }, 24);

  const log = [];
  const record = (phase, point, shotName) =>
    recordProbeSample({
      artifactDir,
      client,
      log,
      phase,
      point,
      shotName,
      targetPaneId: targetColumn.panes[0].paneId,
    });

  // PHASE HOLD: pointer parked, no moves. Expect zero new previews.
  for (let i = 0; i < 8; i += 1) {
    await delay(24);
    await record("hold", { x: colX, y: top });
  }

  // PHASE SWEEP: monotonic downward glide through the stacked column.
  const sweepSteps = 40;
  for (let s = 1; s <= sweepSteps; s += 1) {
    const y = top + ((bottom - top) * s) / sweepSteps;
    await moveMouse(client, { x: colX, y }, 18);
    await record("sweep", { x: colX, y }, s % 10 === 0 ? `sweep-${s}.png` : undefined);
  }

  // PHASE JITTER: tiny ±3px wobble around one interior row boundary.
  const boundaryY =
    (targetColumn.panes[0].rect.top +
      targetColumn.panes[0].rect.height +
      targetColumn.panes[1].rect.top) /
    2;
  for (let s = 0; s < 30; s += 1) {
    const y = boundaryY + (s % 2 === 0 ? -3 : 3);
    await moveMouse(client, { x: colX, y }, 18);
    await record("jitter", { x: colX, y }, s === 14 ? "jitter-mid.png" : undefined);
  }

  await releaseMouse(client, { x: colX, y: boundaryY });
  await captureScreenshot(client, join(artifactDir, "99-after.png"));

  const summary = analyze(log);
  await writeJson(join(artifactDir, "probe-log.json"), log);
  await writeJson(join(artifactDir, "probe-summary.json"), { artifactDir, summary, viewport });
  console.log(JSON.stringify({ artifactDir, summary }, null, 2));
} catch (error) {
  if (context)
    await captureScreenshot(context.client, join(artifactDir, "error.png")).catch(() => {});
  console.error("probe failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopElectronCdpContext(context);
}

function analyze(log) {
  const phase = (name) => log.filter((e) => e.phase === name);
  const flips = (entries) => {
    let n = 0;
    for (let i = 1; i < entries.length; i += 1) {
      const a = entries[i - 1];
      const b = entries[i];
      if (`${a.dropPaneId}:${a.dropTarget}` !== `${b.dropPaneId}:${b.dropTarget}`) n += 1;
    }
    return n;
  };
  const distinct = (entries) =>
    new Set(entries.map((e) => `${e.dropPaneId}:${e.dropAxis}:${e.dropTarget}`)).size;
  const tops = (entries) => new Set(entries.map((e) => JSON.stringify(e.targetColTops))).size;
  const updates = (entries) =>
    entries.length ? entries.at(-1).previewUpdates - entries[0].previewUpdates : 0;
  const hold = phase("hold");
  const sweep = phase("sweep");
  const jitter = phase("jitter");
  return {
    hold: { samples: hold.length, previewUpdates: updates(hold), flips: flips(hold) },
    sweep: {
      samples: sweep.length,
      previewUpdates: updates(sweep),
      targetFlips: flips(sweep),
      distinctTargets: distinct(sweep),
      distinctColumnLayouts: tops(sweep),
    },
    jitter: {
      samples: jitter.length,
      previewUpdates: updates(jitter),
      targetFlips: flips(jitter),
      distinctTargets: distinct(jitter),
      distinctColumnLayouts: tops(jitter),
    },
    totalPreviewUpdates: log.at(-1)?.previewUpdates ?? 0,
    reactCommits: log.at(-1)?.reactCommits ?? 0,
    verdict: {
      oscillatesWhileNearStationary: flips(jitter) >= 3,
      siblingsReposition: tops(sweep) > 1 || tops(jitter) > 1,
      previewChurnVsDistinct: `${log.at(-1)?.previewUpdates ?? 0} updates / ${distinct(sweep) + distinct(jitter)} distinct targets`,
    },
  };
}

async function recordProbeSample({
  artifactDir,
  client,
  log,
  phase,
  point,
  shotName,
  targetPaneId,
}) {
  const snap = await client.evaluate(paneSnapshotExpression());
  const metrics = await client.evaluate(frameMetricsExpression());
  log.push({
    ...dropSampleFields(snap),
    ...metricsSampleFields(metrics),
    phase,
    targetColTops: targetColumnTops(snap, targetPaneId),
    x: Math.round(point.x),
    y: Math.round(point.y),
  });
  if (shotName) {
    await captureScreenshot(client, join(artifactDir, shotName));
  }
}

function dropSampleFields(snapshot) {
  const drop = snapshot.visibleHosts.find((host) => host.dropTarget);
  const source = snapshot.visibleHosts.find((host) => host.dragSource);
  return {
    dropAxis: drop ? drop.dropAxis || null : null,
    dropPaneId: drop ? drop.paneId : null,
    dropTarget: drop ? drop.dropTarget || null : null,
    srcTranslated: source ? Math.round(source.rect.top) : null,
  };
}

function metricsSampleFields(metrics) {
  if (!metrics) {
    return { previewClears: null, previewUpdates: null, reactCommits: null };
  }
  return {
    previewClears: metrics.paneDragPreviewClears,
    previewUpdates: metrics.paneDragPreviewUpdates,
    reactCommits: metrics.reactCommitsDuringMovement,
  };
}

function targetColumnTops(snapshot, targetPaneId) {
  const column = clusterColumns(snapshot.visibleHosts).find((candidate) =>
    candidate.panes.some((pane) => pane.paneId === targetPaneId),
  );
  return column ? column.panes.map((pane) => Math.round(pane.rect.top)) : [];
}

function clusterColumns(hosts) {
  const sorted = hosts.toSorted((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
  const cols = [];
  for (const host of sorted) {
    let col = cols.find((c) => Math.abs(c.x - host.rect.left) < 24);
    if (!col) {
      col = { x: host.rect.left, panes: [] };
      cols.push(col);
    }
    col.panes.push(host);
  }
  for (const col of cols) col.panes.sort((a, b) => a.rect.top - b.rect.top);
  return cols;
}

function currentFocused(scene) {
  return scene.visibleHosts.find((h) => h.focused)?.paneId ?? null;
}

async function ensureWorkspaceOpen(client) {
  const id = await client.evaluate(workspaceIdExpression());
  if (id && id !== "empty") return;
  await waitForState(
    client,
    `(() => ({ ready: Boolean(Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Open project folder" && !b.disabled)) }))()`,
    (v) => v.ready,
    workflowTimeoutMs,
  );
  await client.evaluate(
    `(() => { Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Open project folder")?.click(); return true; })()`,
  );
  await waitForState(
    client,
    workspaceIdExpression(),
    (v) => v !== "" && v !== "empty",
    workflowTimeoutMs,
  );
}

async function waitForNormalPaneHosts(client, min) {
  return waitForState(
    client,
    paneSnapshotExpression(),
    (snap) => snap.mode === "normal" && snap.visibleHosts.length >= min,
    workflowTimeoutMs,
  );
}

async function clickPaneAction(client, paneId, action) {
  await client.evaluate(`(() => {
    const host = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"][data-visible="true"]'))
      .find((c) => c instanceof HTMLElement && c.dataset.paneId === ${JSON.stringify(paneId)});
    const button = host?.querySelector(${JSON.stringify(`[data-workspace-pane-action="${action}"]`)});
    if (button instanceof HTMLButtonElement && !button.disabled) button.click();
    return true;
  })()`);
}

async function dragHandleCenter(client, paneId) {
  const c = await client.evaluate(`(() => {
    const host = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"][data-visible="true"]'))
      .find((x) => x instanceof HTMLElement && x.dataset.paneId === ${JSON.stringify(paneId)});
    const handle = host?.querySelector('[data-workspace-pane-drag-handle="true"]');
    const el = handle instanceof HTMLElement ? handle : host;
    if (!(el instanceof HTMLElement)) return { ok: false };
    const r = el.getBoundingClientRect();
    return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!c.ok) throw new Error(`no drag handle for ${paneId}`);
  return { x: c.x, y: c.y };
}

async function pressMouse(client, p) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: p.x,
    y: p.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: p.x,
    y: p.y,
  });
  await delay(16);
}

async function moveMouse(client, to, settleMs) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: to.x,
    y: to.y,
  });
  await delay(settleMs);
}

async function releaseMouse(client, p) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: p.x,
    y: p.y,
  });
  await delay(80);
}

async function resetFrameMetrics(client) {
  await client.evaluate(`(() => { window.__settaWorkspaceResetFrameMetrics?.(); return true; })()`);
}

function frameMetricsExpression() {
  return `(() => window.__settaWorkspaceReadFrameMetrics?.() ?? null)()`;
}

function workspaceIdExpression() {
  return `(() => { const a = document.querySelector('[data-testid="workspace-layout-area"]'); return a instanceof HTMLElement ? a.dataset.workspaceId ?? "" : ""; })()`;
}

function paneSnapshotExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const hosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((h) => h instanceof HTMLElement && h.dataset.visible === "true")
      .map((h) => {
        const r = h.getBoundingClientRect();
        return {
          dragSource: h.dataset.dragSource === "true",
          dropAxis: h.dataset.dropAxis ?? "",
          dropPreview: h.dataset.dropPreview === "true",
          dropTarget: h.dataset.dropTarget ?? "",
          focused: h.dataset.focused === "true",
          paneId: h.dataset.paneId ?? "",
          rect: { height: r.height, left: r.left, top: r.top, width: r.width },
        };
      });
    return {
      focusedPaneId: hosts.find((h) => h.focused)?.paneId ?? "",
      mode: area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "",
      paneDragging: area instanceof HTMLElement ? area.dataset.paneDragging ?? "" : "",
      visibleHosts: hosts,
    };
  })()`;
}
