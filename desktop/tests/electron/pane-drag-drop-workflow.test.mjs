#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  openFixtureWorkspace,
  parseElectronHarnessArgs,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1440,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/pane-drag-drop-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("pane-drag-drop-workflow");
await writeLatestRecordingPointer("pane-drag-drop-workflow", artifactDir);
const fixture = await createElectronFixture("pane-drag-drop-workflow");
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    fixture,
    visible: options.visible,
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const workspaceId = await ensureWorkspaceOpen(context.client);
  await persistFourColumnLayout(context.client, workspaceId);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await waitForNormalPaneHosts(context.client, 4);
  await captureScreenshot(context.client, join(artifactDir, "normal-before.png"));

  const rowDrop = await performNormalRowDrop(context.client);
  await captureScreenshot(context.client, join(artifactDir, "normal-row-drop.png"));

  const columnDrop = await performNormalColumnDrop(context.client, rowDrop.targetPaneId);
  await captureScreenshot(context.client, join(artifactDir, "normal-column-drop.png"));

  const overviewDrop = await performOverviewColumnDrop(context.client);
  await captureScreenshot(context.client, join(artifactDir, "overview-column-drop.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    columnDrop,
    overviewDrop,
    rowDrop,
    status: "passed",
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron pane drag/drop workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      frameMetrics: await safeFrameMetricsSnapshot(context.client),
      layout: await safeLayoutSnapshot(context.client),
      paneSnapshot: await safePaneSnapshot(context.client),
    }).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function performNormalRowDrop(client) {
  const beforeSplit = await waitForNormalPaneHosts(client, 4);
  const originalFocusedPaneId = beforeSplit.focusedPaneId;
  await clickPaneAction(client, originalFocusedPaneId, "split-down");
  const afterSplit = await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => {
      const focusedHost = snapshot.visibleHosts.find(
        (host) => host.paneId === snapshot.focusedPaneId,
      );
      return (
        snapshot.mode === "normal" &&
        snapshot.focusedPaneId !== "" &&
        snapshot.focusedPaneId !== originalFocusedPaneId &&
        focusedHost !== undefined
      );
    },
    workflowTimeoutMs,
  );
  const sourcePaneId = afterSplit.focusedPaneId;
  const sourceHost = requiredHost(afterSplit, sourcePaneId);
  const targetHost = afterSplit.visibleHosts
    .filter((host) => host.paneId !== sourcePaneId)
    .filter((host) => host.rect.left > sourceHost.rect.left + sourceHost.rect.width / 2)
    .toSorted((left, right) => left.rect.left - right.rect.left)[0];
  if (!targetHost) {
    throw new Error(`no row drop target found: ${JSON.stringify(afterSplit)}`);
  }

  const observation = await dragPaneToPoint(client, {
    expectedDropAxis: "vertical",
    expectedDropTarget: "after",
    sourcePaneId,
    targetPaneId: targetHost.paneId,
    to: {
      x: targetHost.rect.left + targetHost.rect.width / 2,
      y: targetHost.rect.top + targetHost.rect.height * 0.75,
    },
  });
  const layout = await waitForLayout(
    client,
    (candidate) => sameColumnWithOrder(candidate, targetHost.paneId, sourcePaneId),
    `row drop layout for ${sourcePaneId} after ${targetHost.paneId}`,
  );
  const column = columnForPane(layout, sourcePaneId);
  const pane = paneForLayout(layout, sourcePaneId);
  if (pane.weight !== 1) {
    throw new Error(`row drop did not reset pane weight: ${JSON.stringify({ pane })}`);
  }
  return {
    columnId: column.columnId,
    observation,
    sourcePaneId,
    targetPaneId: targetHost.paneId,
  };
}

async function performNormalColumnDrop(client, targetPaneId) {
  const before = await waitForNormalPaneHosts(client, 4);
  const targetHost = requiredHost(before, targetPaneId);
  const sourceHost = before.visibleHosts
    .filter((host) => host.paneId !== targetPaneId)
    .filter((host) => host.rect.left > targetHost.rect.left + targetHost.rect.width / 2)
    .toSorted((left, right) => left.rect.left - right.rect.left)[0];
  if (!sourceHost) {
    throw new Error(`no column-drop source found: ${JSON.stringify(before)}`);
  }
  const beforeLayout = await readUILayout(client);
  const targetColumnBefore = columnForPane(beforeLayout, targetPaneId);

  const observation = await dragPaneToPoint(client, {
    expectedDropAxis: "horizontal",
    expectedDropTarget: "before",
    sourcePaneId: sourceHost.paneId,
    targetPaneId,
    to: {
      x: targetHost.rect.left + 6,
      y: targetHost.rect.top + targetHost.rect.height / 2,
    },
  });
  const layout = await waitForLayout(
    client,
    (candidate) => columnImmediatelyBeforeTarget(candidate, sourceHost.paneId, targetPaneId),
    `column drop layout for ${sourceHost.paneId} before ${targetPaneId}`,
  );
  const sourceColumn = columnForPane(layout, sourceHost.paneId);
  const targetColumn = columnForPane(layout, targetPaneId);
  if (JSON.stringify(sourceColumn.widthSpec) !== JSON.stringify(targetColumn.widthSpec)) {
    throw new Error(
      `column drop did not inherit destination width: ${JSON.stringify({ sourceColumn, targetColumn })}`,
    );
  }
  if (JSON.stringify(targetColumnBefore.widthSpec) !== JSON.stringify(targetColumn.widthSpec)) {
    throw new Error(
      `target column width changed during column drop: ${JSON.stringify({ targetColumnBefore, targetColumn })}`,
    );
  }
  return {
    observation,
    sourceColumn,
    sourcePaneId: sourceHost.paneId,
    targetColumn,
    targetPaneId,
  };
}

async function performOverviewColumnDrop(client) {
  await clickEnabledButtonByAria(client, "Enter overview", workflowTimeoutMs);
  const overview = await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) =>
      snapshot.mode === "overview" &&
      snapshot.visibleHosts.length >= 4 &&
      snapshot.visibleHosts.every((host) => hostInsideStage(snapshot, host)),
    workflowTimeoutMs,
  );
  const sortedHosts = overview.visibleHosts.toSorted(
    (left, right) => left.rect.left - right.rect.left || left.rect.top - right.rect.top,
  );
  const sourceHost = sortedHosts[0];
  const targetHost = sortedHosts.at(-1);
  if (!sourceHost || !targetHost || sourceHost.paneId === targetHost.paneId) {
    throw new Error(`no overview drag target found: ${JSON.stringify(overview)}`);
  }
  const sourcePoint = await overviewPaneBodyPoint(client, sourceHost.paneId);
  const stageRight = overview.stageRect.left + overview.stageRect.width;
  const to = {
    x: Math.min(targetHost.rect.left + targetHost.rect.width + 2, stageRight - 1),
    y: targetHost.rect.top + targetHost.rect.height / 2,
  };
  await resetFrameMetrics(client);

  await dispatchMousePress(client, sourcePoint);
  await waitForState(
    client,
    driverCallExpression("paneDragDropOverviewState", { sourcePaneId: sourceHost.paneId }),
    (state) => state.sourceDragSource === true,
    workflowTimeoutMs,
  );
  await dispatchMouseMove(client, to, { buttons: 1 });
  // Overview now uses the shared drop model: dropping past the rightmost card
  // shows the preview-only landing box, not an edge highlight on that card.
  const ghost = await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => overviewColumnDropPreviewVisible(snapshot, sourceHost.paneId, targetHost.paneId),
    workflowTimeoutMs,
  );
  await dispatchMouseRelease(client, to);
  const layout = await waitForLayout(
    client,
    (candidate) => columnImmediatelyAfterTarget(candidate, sourceHost.paneId, targetHost.paneId),
    `overview column drop layout for ${sourceHost.paneId} after ${targetHost.paneId}`,
  );
  const afterDrop = await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => {
      const source = snapshot.visibleHosts.find((host) => host.paneId === sourceHost.paneId);
      return (
        snapshot.focusedPaneId === sourceHost.paneId &&
        source !== undefined &&
        !source.dragSource &&
        snapshot.ghost === null
      );
    },
    workflowTimeoutMs,
  );
  const metrics = await readFrameMetrics(client);
  assertPaneDragPreviewMetrics(metrics, "overview column drop");
  return {
    afterDrop,
    ghost,
    metrics,
    sourceColumn: columnForPane(layout, sourceHost.paneId),
    sourcePaneId: sourceHost.paneId,
    targetColumn: columnForPane(layout, targetHost.paneId),
    targetPaneId: targetHost.paneId,
  };
}

async function dragPaneToPoint(
  client,
  { expectedDropAxis, expectedDropTarget, sourcePaneId, targetPaneId, to },
) {
  const from = await dragHandleCenter(client, sourcePaneId);
  await resetFrameMetrics(client);
  await dispatchMousePress(client, from);
  await dispatchMouseMove(client, to, { buttons: 1 });
  const during = await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => {
      const source = snapshot.visibleHosts.find((host) => host.paneId === sourcePaneId);
      const target = snapshot.visibleHosts.find((host) => host.paneId === targetPaneId);
      return (
        snapshot.paneDragging === "true" &&
        source?.dragSource === true &&
        target?.dropAxis === expectedDropAxis &&
        target?.dropTarget === expectedDropTarget
      );
    },
    workflowTimeoutMs,
  );
  await dispatchMouseRelease(client, to);
  const after = await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => {
      const source = snapshot.visibleHosts.find((host) => host.paneId === sourcePaneId);
      const target = snapshot.visibleHosts.find((host) => host.paneId === targetPaneId);
      return (
        snapshot.focusedPaneId === sourcePaneId &&
        source !== undefined &&
        !source.dragSource &&
        !target?.dropAxis &&
        !target?.dropTarget
      );
    },
    workflowTimeoutMs,
  );
  const metrics = await readFrameMetrics(client);
  assertPaneDragPreviewMetrics(metrics, `${sourcePaneId} to ${targetPaneId}`);
  return { after, during, metrics };
}

function overviewColumnDropPreviewVisible(snapshot, sourcePaneId, targetPaneId) {
  return (
    snapshot.mode === "overview" &&
    activeOverviewDrag(snapshot, sourcePaneId) &&
    (overviewHostPreview(snapshot, targetPaneId) || overviewLandingGhost(snapshot, targetPaneId))
  );
}

function activeOverviewDrag(snapshot, sourcePaneId) {
  const source = snapshot.visibleHosts.find((host) => host.paneId === sourcePaneId);
  return snapshot.overviewDragging === "true" && source?.dragSource === true;
}

function overviewHostPreview(snapshot, targetPaneId) {
  return snapshot.visibleHosts.some(
    (host) => host.paneId === targetPaneId && host.dropPreview === true,
  );
}

function overviewLandingGhost(snapshot, targetPaneId) {
  return snapshot.ghost?.paneId === targetPaneId && snapshot.ghost.placement === "right";
}

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return currentWorkspaceId;
  }
  await openFixtureWorkspace(client, workflowTimeoutMs);
  return waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function persistFourColumnLayout(client, workspaceId) {
  await client.evaluate(`(async () => {
    await window.setta.appLayout.savePaneLayout(${JSON.stringify(fourColumnAppLayout(workspaceId))});
    return true;
  })()`);
}

function fourColumnLayout(workspaceId) {
  const panes = Array.from({ length: 4 }, (_value, index) => ({
    columnId: `workspace_column_${index}`,
    conversationConfig: null,
    heat: (index * 37) % 100,
    paneId: `workspace_pane_${index}`,
    sequence: index,
    subtitle: "drag fixture",
    surfaceId: `workspace_surface_${index}`,
    surfaceKind: "empty-frame",
    title: `Empty Frame ${index + 1}`,
    tone: ["cyan", "green", "orange", "pink"][index],
    weight: 1,
  }));
  return {
    columns: panes.map((pane, index) => ({
      columnId: pane.columnId,
      idealWidthSpec: { unit: "px", value: 520 },
      index,
      paneIds: [pane.paneId],
      planeIndex: 0,
      previousProportionWidth: null,
      slotIndex: index,
      widthSpec: { unit: "px", value: 520 },
    })),
    focusedPaneId: panes[0].paneId,
    panes,
    schemaVersion: 1,
    workspaceId,
  };
}

function fourColumnAppLayout(workspaceId) {
  const layout = fourColumnLayout(workspaceId);
  return {
    columns: [
      appMasterColumn(),
      ...layout.columns.map((column) => ({
        ...column,
        index: column.index + 1,
        slotIndex: column.slotIndex + 1,
      })),
    ],
    focusedPaneId: layout.focusedPaneId,
    maximizedPaneId: null,
    panes: [appMasterPane(), ...layout.panes.map(appPaneFromWorkspacePane)],
    schemaVersion: 1,
  };
}

function appPaneFromWorkspacePane({ conversationConfig, ...pane }) {
  void conversationConfig;
  return {
    ...pane,
    conversationConfig: null,
    masterConfig: null,
  };
}

function appMasterColumn() {
  return {
    columnId: "app_column_master",
    idealWidthSpec: { unit: "px", value: 520 },
    index: 0,
    paneIds: ["app_pane_master"],
    planeIndex: 0,
    previousProportionWidth: null,
    slotIndex: 0,
    widthSpec: { unit: "px", value: 520 },
  };
}

function appMasterPane() {
  return {
    columnId: "app_column_master",
    conversationConfig: null,
    heat: 0,
    masterConfig: {},
    paneId: "app_pane_master",
    sequence: 0,
    subtitle: "Global coordinator",
    surfaceId: "app_surface_master",
    surfaceKind: "master",
    title: "Setta",
    tone: "slate",
    weight: 1,
  };
}

async function waitForNormalPaneHosts(client, minimumCount) {
  return waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => snapshot.mode === "normal" && snapshot.visibleHosts.length >= minimumCount,
    workflowTimeoutMs,
  );
}

async function clickPaneAction(client, paneId, action) {
  const clicked = await client.evaluate(`(() => {
    const host = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"][data-visible="true"]'))
      .find((candidate) => candidate instanceof HTMLElement && candidate.dataset.paneId === ${JSON.stringify(paneId)});
    const button = host?.querySelector(${JSON.stringify(`[data-workspace-pane-action="${action}"]`)});
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`pane action click failed for ${paneId}/${action}: ${JSON.stringify(clicked)}`);
  }
}

async function dragHandleCenter(client, paneId) {
  const center = await client.evaluate(`(() => {
    const host = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"][data-visible="true"]'))
      .find((candidate) => candidate instanceof HTMLElement && candidate.dataset.paneId === ${JSON.stringify(paneId)});
    const handle = host?.querySelector('[data-workspace-pane-drag-handle="true"]');
    const hostRect = host instanceof HTMLElement ? host.getBoundingClientRect() : null;
    const handleRect = handle instanceof HTMLElement ? handle.getBoundingClientRect() : null;
    const handleCenter = handleRect
      ? { x: handleRect.left + handleRect.width / 2, y: handleRect.top + handleRect.height / 2 }
      : null;
    const handleInsideHost = Boolean(
      hostRect &&
        handleCenter &&
        handleCenter.x >= hostRect.left &&
        handleCenter.x <= hostRect.right &&
        handleCenter.y >= hostRect.top &&
        handleCenter.y <= hostRect.bottom,
    );
    const target = handleRect && handleRect.width > 0 && handleRect.height > 0 && handleInsideHost
      ? handle
      : host;
    if (!(target instanceof HTMLElement)) {
      return { ok: false, reason: "missing-target" };
    }
    const rect = target.getBoundingClientRect();
    return {
      ok: true,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);
  if (!center.ok) {
    throw new Error(`drag handle was not found for ${paneId}: ${JSON.stringify(center)}`);
  }
  return { x: center.x, y: center.y };
}

async function overviewPaneBodyPoint(client, paneId) {
  const point = await client.driver("paneDragDropOverviewBodyPoint", { paneId });
  if (!point.ok) {
    throw new Error(`overview pane body was not found for ${paneId}: ${JSON.stringify(point)}`);
  }
  return { x: point.x, y: point.y };
}

async function dispatchMousePress(client, point) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await delay(16);
}

async function dispatchMouseMove(client, to, { buttons, from = to, steps = 1 }) {
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons,
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await delay(16);
  }
  await delay(80);
}

async function dispatchMouseRelease(client, point) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
  await delay(80);
}

async function waitForLayout(client, predicate, label) {
  return waitForState(
    client,
    layoutSnapshotExpression(),
    (snapshot) => snapshot.layout !== null && predicate(snapshot.layout),
    workflowTimeoutMs,
  ).then((snapshot) => {
    if (!snapshot.layout) {
      throw new Error(`layout was not available for ${label}`);
    }
    return snapshot.layout;
  });
}

async function readUILayout(client) {
  const snapshot = await client.evaluate(layoutSnapshotExpression());
  if (!snapshot.layout) {
    throw new Error(`workspace layout was not persisted: ${JSON.stringify(snapshot)}`);
  }
  return snapshot.layout;
}

async function safePaneSnapshot(client) {
  try {
    return await client.evaluate(paneSnapshotExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function safeLayoutSnapshot(client) {
  try {
    return await client.evaluate(layoutSnapshotExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function safeFrameMetricsSnapshot(client) {
  try {
    return await readFrameMetrics(client);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function readFrameMetrics(client) {
  const metrics = await client.evaluate(frameMetricsExpression());
  if (!metrics) {
    throw new Error("workspace frame metrics hook was not installed");
  }
  return metrics;
}

async function resetFrameMetrics(client) {
  const reset = await client.evaluate(frameMetricsResetExpression());
  if (!reset) {
    throw new Error("workspace frame metrics reset hook was not installed");
  }
}

function assertPaneDragPreviewMetrics(metrics, label) {
  if (metrics.paneDragPreviewUpdates !== 1 || metrics.paneDragPreviewClears !== 1) {
    throw new Error(
      `unexpected pane drag preview metrics for ${label}: ${JSON.stringify(metrics)}`,
    );
  }
}

function sameColumnWithOrder(layout, targetPaneId, sourcePaneId) {
  const column = findColumnForPane(layout, sourcePaneId);
  const targetColumn = findColumnForPane(layout, targetPaneId);
  if (!column || !targetColumn || column.columnId !== targetColumn.columnId) {
    return false;
  }
  return column.paneIds.indexOf(sourcePaneId) === column.paneIds.indexOf(targetPaneId) + 1;
}

function columnImmediatelyBeforeTarget(layout, sourcePaneId, targetPaneId) {
  const sourceColumn = findColumnForPane(layout, sourcePaneId);
  const targetColumn = findColumnForPane(layout, targetPaneId);
  return (
    sourceColumn !== null &&
    targetColumn !== null &&
    sourceColumn.paneIds.length === 1 &&
    sourceColumn.planeIndex === targetColumn.planeIndex &&
    sourceColumn.slotIndex + 1 === targetColumn.slotIndex
  );
}

function columnImmediatelyAfterTarget(layout, sourcePaneId, targetPaneId) {
  const sourceColumn = findColumnForPane(layout, sourcePaneId);
  const targetColumn = findColumnForPane(layout, targetPaneId);
  return (
    sourceColumn !== null &&
    targetColumn !== null &&
    sourceColumn.paneIds.length === 1 &&
    sourceColumn.planeIndex === targetColumn.planeIndex &&
    sourceColumn.slotIndex === targetColumn.slotIndex + 1
  );
}

function findColumnForPane(layout, paneId) {
  return layout.columns.find((candidate) => candidate.paneIds.includes(paneId)) ?? null;
}

function columnForPane(layout, paneId) {
  const column = findColumnForPane(layout, paneId);
  if (column === null) {
    throw new Error(`column for pane ${paneId} was not found: ${JSON.stringify(layout)}`);
  }
  return column;
}

function paneForLayout(layout, paneId) {
  const pane = layout.panes.find((candidate) => candidate.paneId === paneId);
  if (!pane) {
    throw new Error(`pane ${paneId} was not found: ${JSON.stringify(layout)}`);
  }
  return pane;
}

function requiredHost(snapshot, paneId) {
  const host = snapshot.visibleHosts.find((candidate) => candidate.paneId === paneId);
  if (!host) {
    throw new Error(`host ${paneId} was not visible: ${JSON.stringify(snapshot)}`);
  }
  return host;
}

function hostInsideStage(snapshot, host) {
  return (
    host.rect.left >= snapshot.stageRect.left &&
    host.rect.left + host.rect.width <= snapshot.stageRect.left + snapshot.stageRect.width &&
    host.rect.top >= snapshot.stageRect.top &&
    host.rect.top + host.rect.height <= snapshot.stageRect.top + snapshot.stageRect.height
  );
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function layoutSnapshotExpression() {
  return driverCallExpression("paneDragDropPersistedWorkspaceLayout");
}

function frameMetricsExpression() {
  return `(() => window.__settaWorkspaceReadFrameMetrics?.() ?? null)()`;
}

function frameMetricsResetExpression() {
  return `(() => {
    if (!window.__settaWorkspaceResetFrameMetrics) {
      return false;
    }
    window.__settaWorkspaceResetFrameMetrics();
    return true;
  })()`;
}

function paneSnapshotExpression() {
  return driverCallExpression("paneDragDropPaneSnapshot");
}
