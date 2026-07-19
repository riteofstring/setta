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
  dispatchMouseDrag,
  launchElectronCdpContext,
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
const geometryTolerancePx = 2;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1440,
};
const compactViewport = {
  ...viewport,
  width: 760,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/pane-resize-handles-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("pane-resize-handles-workflow");
await writeLatestRecordingPointer("pane-resize-handles-workflow", artifactDir);
const fixture = await createElectronFixture("pane-resize-handles-workflow");
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
  await waitForInitialEasyButtonStartupToSettle(context.client);
  await persistTwoColumnLayout(context.client, workspaceId);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await waitForResizeHandles(context.client, "horizontal");
  await captureScreenshot(context.client, join(artifactDir, "horizontal-before.png"));

  const horizontalBefore = await resizeTarget(context.client, "horizontal");
  assertHandleInPaneGap(horizontalBefore);
  assertPaneGap(horizontalBefore);
  await dispatchMouseDrag(context.client, {
    from: horizontalBefore.handle.center,
    to: {
      x: horizontalBefore.handle.center.x + 80,
      y: horizontalBefore.handle.center.y,
    },
  });
  const horizontalAfter = await waitForPaneWidthChange(context.client, horizontalBefore, 50);
  const horizontalAfterSourceHost = requiredSnapshotHost(
    horizontalAfter,
    horizontalBefore.sourceHost.paneId,
  );
  await captureScreenshot(context.client, join(artifactDir, "horizontal-after.png"));
  await context.client.call("Emulation.setDeviceMetricsOverride", compactViewport);
  const horizontalCompact = await waitForPaneWidthClamp(
    context.client,
    horizontalAfterSourceHost,
    40,
  );
  await captureScreenshot(context.client, join(artifactDir, "horizontal-compact.png"));
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  const horizontalRestored = await waitForPaneWidthRestore(
    context.client,
    horizontalAfterSourceHost,
  );
  await captureScreenshot(context.client, join(artifactDir, "horizontal-restored.png"));

  await clickFocusedPaneAction(context.client, "split-down");
  await waitForResizeHandles(context.client, "vertical");
  await delay(600);
  await captureScreenshot(context.client, join(artifactDir, "vertical-before.png"));

  const verticalBefore = await resizeTarget(context.client, "vertical");
  assertHandleInPaneGap(verticalBefore);
  assertPaneGap(verticalBefore);
  await dispatchMouseDrag(context.client, {
    from: verticalBefore.handle.center,
    to: {
      x: verticalBefore.handle.center.x,
      y: verticalBefore.handle.center.y + 70,
    },
  });
  const verticalAfter = await waitForPaneSplitResize(context.client, verticalBefore, 40);
  await captureScreenshot(context.client, join(artifactDir, "vertical-after.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    horizontalAfter,
    horizontalBefore,
    horizontalCompact,
    horizontalRestored,
    status: "passed",
    verticalAfter,
    verticalBefore,
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron pane resize handles workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      snapshot: await safeResizeSnapshot(context.client),
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

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return currentWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  return waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function persistTwoColumnLayout(client, workspaceId) {
  await client.evaluate(`(async () => {
    await window.setta.appLayout.savePaneLayout(${JSON.stringify(twoColumnAppLayout(workspaceId))});
    return true;
  })()`);
}

async function waitForInitialEasyButtonStartupToSettle(client) {
  await waitForState(
    client,
    "Boolean(document.querySelector('[data-testid=\"initial-easy-button-pane\"]'))",
    (present) => !present,
    workflowTimeoutMs,
  );
}

function twoColumnLayout(workspaceId) {
  const panes = [0, 1].map((index) => ({
    columnId: `workspace_column_${index}`,
    conversationConfig: null,
    heat: index * 37,
    paneId: `workspace_pane_${index}`,
    sequence: index,
    subtitle: "resize fixture",
    surfaceId: `workspace_surface_${index}`,
    surfaceKind: "empty-frame",
    title: `Empty Frame ${index + 1}`,
    tone: index === 0 ? "cyan" : "green",
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

function twoColumnAppLayout(workspaceId) {
  const layout = twoColumnLayout(workspaceId);
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

async function clickFocusedPaneAction(client, action) {
  const clicked = await client.evaluate(`(() => {
    const focusedHost = document.querySelector('[data-testid="workspace-pane-host"][data-focused="true"]');
    const button = focusedHost?.querySelector(${JSON.stringify(`[data-workspace-pane-action="${action}"]`)});
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
    throw new Error(`pane action click failed for ${action}: ${JSON.stringify(clicked)}`);
  }
}

async function waitForResizeHandles(client, axis) {
  await client.installDriver();
  return waitForState(
    client,
    resizeSnapshotExpression(),
    (snapshot) =>
      snapshot.mode === "normal" &&
      snapshot.visibleHosts.length >= 2 &&
      snapshot.handles.some((handle) => handle.axis === axis),
    workflowTimeoutMs,
  );
}

async function resizeTarget(client, axis) {
  const snapshot = await waitForResizeHandles(client, axis);
  const target = snapshot.handles
    .filter((handle) => handle.axis === axis)
    .map((handle) => ({
      adjacentHost: snapshot.visibleHosts.find((host) => host.paneId === handle.adjacentPaneId),
      handle,
      sourceHost: snapshot.visibleHosts.find((host) => host.paneId === handle.paneId),
    }))
    .find((candidate) => candidate.sourceHost && candidate.adjacentHost);
  if (!target?.sourceHost || !target.adjacentHost) {
    throw new Error(`no resize target for ${axis}: ${JSON.stringify(snapshot)}`);
  }
  return target;
}

async function waitForPaneWidthChange(client, target, minimumDelta) {
  return waitForState(
    client,
    resizeSnapshotExpression(),
    (snapshot) => {
      const host = snapshot.visibleHosts.find(
        (candidate) => candidate.paneId === target.sourceHost.paneId,
      );
      return Boolean(host && host.rect.width >= target.sourceHost.rect.width + minimumDelta);
    },
    workflowTimeoutMs,
  );
}

async function waitForPaneSplitResize(client, target, minimumDelta) {
  return waitForState(
    client,
    resizeSnapshotExpression(),
    (snapshot) => {
      const sourceHost = snapshot.visibleHosts.find(
        (candidate) => candidate.paneId === target.sourceHost.paneId,
      );
      const adjacentHost = snapshot.visibleHosts.find(
        (candidate) => candidate.paneId === target.adjacentHost.paneId,
      );
      return Boolean(
        sourceHost &&
        adjacentHost &&
        sourceHost.rect.height >= target.sourceHost.rect.height + minimumDelta &&
        adjacentHost.rect.height <= target.adjacentHost.rect.height - minimumDelta,
      );
    },
    workflowTimeoutMs,
  );
}

async function waitForPaneWidthClamp(client, originalHost, minimumDelta) {
  return waitForState(
    client,
    resizeSnapshotExpression(),
    (snapshot) => {
      const host = snapshot.visibleHosts.find(
        (candidate) => candidate.paneId === originalHost.paneId,
      );
      return Boolean(
        host &&
        snapshot.stage &&
        host.rect.width <= originalHost.rect.width - minimumDelta &&
        host.rect.width <= snapshot.stage.width - 20 + geometryTolerancePx,
      );
    },
    workflowTimeoutMs,
  );
}

async function waitForPaneWidthRestore(client, originalHost) {
  return waitForState(
    client,
    resizeSnapshotExpression(),
    (snapshot) => {
      const host = snapshot.visibleHosts.find(
        (candidate) => candidate.paneId === originalHost.paneId,
      );
      return Boolean(host && host.rect.width >= originalHost.rect.width - geometryTolerancePx);
    },
    workflowTimeoutMs,
  );
}

function assertHandleInPaneGap(target) {
  if (target.handle.axis === "horizontal") {
    const expectedX =
      target.sourceHost.rect.right +
      Math.max(0, target.adjacentHost.rect.left - target.sourceHost.rect.right) / 2;
    if (Math.abs(target.handle.center.x - expectedX) > geometryTolerancePx) {
      throw new Error(`horizontal handle is not centered in pane gap: ${JSON.stringify(target)}`);
    }
    return;
  }
  const expectedY =
    target.sourceHost.rect.bottom +
    Math.max(0, target.adjacentHost.rect.top - target.sourceHost.rect.bottom) / 2;
  if (Math.abs(target.handle.center.y - expectedY) > geometryTolerancePx) {
    throw new Error(`vertical handle is not centered in pane gap: ${JSON.stringify(target)}`);
  }
}

function assertPaneGap(target) {
  const gap =
    target.handle.axis === "horizontal"
      ? target.adjacentHost.rect.left - target.sourceHost.rect.right
      : target.adjacentHost.rect.top - target.sourceHost.rect.bottom;
  if (gap < -geometryTolerancePx || gap > 16 + geometryTolerancePx) {
    throw new Error(`resize target panes have an unexpected gap: ${JSON.stringify(target)}`);
  }
}

function requiredSnapshotHost(snapshot, paneId) {
  const host = snapshot.visibleHosts.find((candidate) => candidate.paneId === paneId);
  if (!host) {
    throw new Error(`missing pane ${paneId} in resize snapshot: ${JSON.stringify(snapshot)}`);
  }
  return host;
}

async function safeResizeSnapshot(client) {
  try {
    return await client.evaluate(resizeSnapshotExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function resizeSnapshotExpression() {
  return driverCallExpression("paneResizeHandlesSnapshot");
}
