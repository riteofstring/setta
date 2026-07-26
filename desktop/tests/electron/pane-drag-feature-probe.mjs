#!/usr/bin/env node
/* global console */

// TEMPORARY diagnostic probe (not CI): verifies the new drop semantics live --
// swap (drop on a pane's center) and extend-left (drop in empty space left of
// all columns). Prints PASS/FAIL per behavior. Safe to delete.

import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  waitForSelector,
  waitForState,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const timeoutMs = 25_000;
const viewport = { deviceScaleFactor: 1, height: 900, mobile: false, width: 1440 };
const fixture = await createElectronFixture("pane-drag-feature-probe");
let context = null;
const results = [];

try {
  context = await launchElectronCdpContext({
    artifactDir: options.artifactDir || "/tmp/pane-drag-feature-probe",
    fixture,
    visible: options.visible,
  });
  const { client } = context;
  await client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await ensureWorkspaceOpen(client);
  await waitForNormalPaneHosts(client, 4);

  // --- SWAP: drag one pane onto another pane's center; the two should trade
  //     slots (verified by position, no persisted layout needed). ---
  {
    const scene = await snapshot(client);
    const source = scene.visibleHosts.toSorted((a, b) => a.rect.left - b.rect.left)[0];
    const target = scene.visibleHosts.find(
      (h) => Math.round(h.rect.left) !== Math.round(source.rect.left),
    );
    const sourceLeft = source.rect.left;
    const targetLeft = target.rect.left;
    const bystander = scene.visibleHosts.find(
      (h) => h.paneId !== source.paneId && h.paneId !== target.paneId,
    );
    const bystanderLeft = bystander?.rect.left ?? null;
    const beforeMap = posMap(scene);
    // Drag manually so we can read the drop affordance right before release.
    const from = await dragHandleCenter(client, source.paneId);
    await press(client, from);
    const to = center(target);
    for (let i = 1; i <= 14; i += 1) {
      await move(client, {
        x: from.x + ((to.x - from.x) * i) / 14,
        y: from.y + ((to.y - from.y) * i) / 14,
      });
    }
    const affordance = await client.evaluate(affordanceExpression());
    await release(client, to);
    await delay(160);
    const after = await snapshot(client);
    console.log(
      "SWAP diag:",
      JSON.stringify({
        sourcePaneId: source.paneId,
        targetPaneId: target.paneId,
        to,
        beforeMap,
        affordance: affordance.filter((h) => h.dropSwap || h.dropTarget),
        afterMap: posMap(after),
      }),
    );
    const sourceAfter = after.visibleHosts.find((h) => h.paneId === source.paneId);
    const targetAfter = after.visibleHosts.find((h) => h.paneId === target.paneId);
    // A swap flips the two panes' relative order (their absolute positions also
    // shift because the drop focuses the source and the row re-scrolls).
    const orderFlipped =
      !!sourceAfter &&
      !!targetAfter &&
      Math.sign(sourceLeft - targetLeft) ===
        -Math.sign(sourceAfter.rect.left - targetAfter.rect.left);
    const bystanderAfter = after.visibleHosts.find((h) => h.paneId === bystander?.paneId);
    const viewportStable =
      bystanderLeft === null ||
      (!!bystanderAfter && Math.abs(bystanderAfter.rect.left - bystanderLeft) < 60);
    results.push({
      behavior: "swap onto center",
      pass: orderFlipped && viewportStable,
      detail: {
        orderFlipped,
        viewportStable,
        bystanderLeft: bystanderLeft === null ? null : Math.round(bystanderLeft),
        bystanderAfterLeft: Math.round(bystanderAfter?.rect.left ?? -1),
      },
    });
  }

  // --- EXTEND LEFT: drag a pane into empty space left of all columns; it should
  //     become the leftmost pane. ---
  {
    const scene = await snapshot(client);
    const stageLeft = scene.stageRect.left;
    const leftmostBefore = Math.min(...scene.visibleHosts.map((h) => h.rect.left));
    // Rightmost pane whose handle is actually on-screen (grabbable).
    const source = scene.visibleHosts
      .filter((h) => h.rect.left + 40 < viewport.width)
      .toSorted((a, b) => b.rect.left - a.rect.left)[0];
    const dropX = Math.max(stageLeft + 4, leftmostBefore - 28);
    const dropY = source.rect.top + source.rect.height / 2;
    await dragTo(client, source.paneId, { x: dropX, y: dropY });
    const after = await snapshot(client);
    const sourceAfter = after.visibleHosts.find((h) => h.paneId === source.paneId);
    const otherLefts = after.visibleHosts
      .filter((h) => h.paneId !== source.paneId)
      .map((h) => h.rect.left);
    const becameLeftmost =
      !!sourceAfter && otherLefts.every((left) => sourceAfter.rect.left <= left + 4);
    results.push({
      behavior: "extend left (drop past leftmost column)",
      pass: becameLeftmost,
      detail: {
        leftmostBefore: Math.round(leftmostBefore),
        sourceAfterLeft: Math.round(sourceAfter?.rect.left ?? -1),
        minOtherLeftAfter: Math.round(Math.min(...otherLefts)),
      },
    });
  }

  // --- OVERVIEW SWAP: enter overview, drag a card onto another card's center. ---
  {
    await clickEnabledButtonByAria(client, "Enter overview", timeoutMs);
    await waitForState(
      client,
      snapshotExpression(),
      (s) => s.mode === "overview" && s.visibleHosts.length >= 4,
      timeoutMs,
    );
    await delay(350); // let the overview zoom settle
    const scene = await snapshot(client);
    const source = scene.visibleHosts.toSorted(
      (a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top,
    )[0];
    const target = scene.visibleHosts.find((h) => h.paneId !== source.paneId);
    const srcPos = center(source);
    const tgtPos = center(target);
    const beforeMap = posMap(scene);
    await press(client, srcPos);
    for (let i = 1; i <= 16; i += 1) {
      await move(client, {
        x: srcPos.x + ((tgtPos.x - srcPos.x) * i) / 16,
        y: srcPos.y + ((tgtPos.y - srcPos.y) * i) / 16,
      });
    }
    const affordance = await client.evaluate(affordanceExpression());
    await release(client, tgtPos);
    await delay(250);
    const after = await snapshot(client);
    const sourceAfter = after.visibleHosts.find((h) => h.paneId === source.paneId);
    const targetAfter = after.visibleHosts.find((h) => h.paneId === target.paneId);
    const swapped =
      !!sourceAfter &&
      !!targetAfter &&
      dist(center(sourceAfter), tgtPos) < 70 &&
      dist(center(targetAfter), srcPos) < 70;
    results.push({
      behavior: "overview swap onto card center",
      pass: swapped,
      detail: {
        beforeMap,
        swapAffordance: affordance.filter((h) => h.dropSwap || h.dropTarget),
        afterMap: posMap(after),
      },
    });
  }

  console.log(JSON.stringify({ results }, null, 2));
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
} catch (error) {
  console.error("feature probe failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopElectronCdpContext(context);
}

function center(host) {
  return { x: host.rect.left + host.rect.width / 2, y: host.rect.top + host.rect.height / 2 };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function posMap(scene) {
  return scene.visibleHosts.map((h) => `${h.paneId}@${Math.round(h.rect.left)}`).join(" ");
}

function affordanceExpression() {
  return `(() => Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
    .filter((h) => h instanceof HTMLElement && h.dataset.visible === "true")
    .map((h) => ({ paneId: h.dataset.paneId ?? "", dropPreview: h.dataset.dropPreview === "true", dropSwap: h.dataset.dropSwap === "true", dropTarget: h.dataset.dropTarget ?? "", dragSource: h.dataset.dragSource === "true" })))()`;
}

async function dragTo(client, sourcePaneId, to) {
  const from = await dragHandleCenter(client, sourcePaneId);
  await press(client, from);
  // Many incremental moves so the preview resolves against committed geometry.
  const steps = 14;
  for (let i = 1; i <= steps; i += 1) {
    await move(client, {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    });
  }
  await release(client, to);
  await delay(160);
}

async function snapshot(client) {
  return client.evaluate(snapshotExpression());
}

async function ensureWorkspaceOpen(client) {
  const id = await client.evaluate(workspaceIdExpression());
  if (id && id !== "empty") return;
  await waitForState(
    client,
    `(() => ({ ready: Boolean(Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Open project folder" && !b.disabled)) }))()`,
    (v) => v.ready,
    timeoutMs,
  );
  await client.evaluate(
    `(() => { Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Open project folder")?.click(); return true; })()`,
  );
  await waitForState(client, workspaceIdExpression(), (v) => v !== "" && v !== "empty", timeoutMs);
}

async function waitForNormalPaneHosts(client, min) {
  return waitForState(
    client,
    snapshotExpression(),
    (s) => s.mode === "normal" && s.visibleHosts.length >= min,
    timeoutMs,
  );
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

async function press(client, p) {
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

async function move(client, to) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: to.x,
    y: to.y,
  });
  await delay(18);
}

async function release(client, p) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: p.x,
    y: p.y,
  });
  await delay(60);
}

function workspaceIdExpression() {
  return `(() => { const a = document.querySelector('[data-testid="workspace-layout-area"]'); return a instanceof HTMLElement ? a.dataset.workspaceId ?? "" : ""; })()`;
}

function snapshotExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    const stageRect = stage instanceof HTMLElement ? stage.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const hosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((h) => h instanceof HTMLElement && h.dataset.visible === "true")
      .map((h) => { const r = h.getBoundingClientRect(); return { paneId: h.dataset.paneId ?? "", rect: { height: r.height, left: r.left, top: r.top, width: r.width } }; });
    return {
      mode: area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "",
      stageRect: { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height },
      visibleHosts: hosts,
    };
  })()`;
}
