#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  dispatchKeyEvent,
  dispatchMouseDrag,
  dispatchMouseClick,
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
import { driverCallExpression } from "./cdp-client.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "workspace-ultrawide-live-panes";
const workflowTimeoutMs = 30_000;
const cdpAltMetaModifier = 5;
const paneCount = 24;
const expectedIntersectingPaneCount = 23;
const multiRowPaneCount = 12;
const multiRowExpectedIntersectingPaneCount = 12;
const verticalStackPaneCount = 10;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 12000,
};
const multiRowViewport = {
  ...viewport,
  width: 3600,
};
const multiRowConstrainedViewport = {
  ...viewport,
  height: 520,
  width: 2200,
};
const verticalStackViewport = {
  ...viewport,
  height: 520,
  width: 1200,
};

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/${basename(import.meta.url)} [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]`,
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const workspaceId = await ensureWorkspaceOpen(context.client);
  await persistUltraWideLayout(context.client, workspaceId);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]', workflowTimeoutMs);

  const snapshot = await waitForLivePaneSnapshot(context.client, {
    expectedIntersectingPaneCount,
    paneCount,
  });
  await captureScreenshot(context.client, join(artifactDir, "ultrawide-live-panes.png"));
  await context.client.call("Emulation.setDeviceMetricsOverride", multiRowConstrainedViewport);
  await persistMultiRowLayout(context.client, workspaceId);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]', workflowTimeoutMs);
  const constrainedMultiRowSnapshot = await waitForLivePaneSnapshot(context.client, {
    maxIntersectingPaneCount: multiRowExpectedIntersectingPaneCount - 1,
    minIntersectingPaneCount: 1,
    paneCount: multiRowPaneCount,
    requiredFocusedPaneId: "multirow_pane_0",
  });
  await dispatchWorkspaceNavigationShortcut(context.client, "ArrowDown");
  const rowNavigationSnapshot = await waitForLivePaneSnapshot(context.client, {
    minIntersectingPaneCount: 1,
    paneCount: multiRowPaneCount,
    requiredFocusedPaneId: "multirow_pane_1",
    requiredIntersectingPaneId: "multirow_pane_1",
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", multiRowViewport);
  const multiRowSnapshot = await waitForLivePaneSnapshot(context.client, {
    expectedIntersectingPaneCount: multiRowExpectedIntersectingPaneCount,
    paneCount: multiRowPaneCount,
    requiredFocusedPaneId: "multirow_pane_1",
  });
  const clickPreservationChecks = [
    await assertVisiblePaneClickFocusesWithoutReveal(
      context.client,
      multiRowSnapshot,
      "empty-frame",
    ),
    await assertVisiblePaneClickFocusesWithoutReveal(
      context.client,
      multiRowSnapshot,
      "easy-button",
    ),
  ];
  await captureScreenshot(context.client, join(artifactDir, "multirow-live-panes.png"));
  await context.client.call("Emulation.setDeviceMetricsOverride", verticalStackViewport);
  await persistVerticalStackLayout(context.client, workspaceId);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]', workflowTimeoutMs);
  const verticalStackBeforeResize = await waitForLivePaneSnapshot(context.client, {
    maxIntersectingPaneCount: 4,
    minIntersectingPaneCount: 2,
    paneCount: verticalStackPaneCount,
    requiredFocusedPaneId: "vertical_pane_0",
  });
  const verticalResizeTarget = await waitForVerticalResizeTarget(context.client, {
    adjacentPaneId: "vertical_pane_1",
    paneId: "vertical_pane_0",
  });
  await dispatchMouseDrag(context.client, {
    from: verticalResizeTarget.handle.center,
    to: {
      x: verticalResizeTarget.handle.center.x,
      y: verticalResizeTarget.handle.center.y - 260,
    },
  });
  const verticalStackAfterResize = await waitForLivePaneSnapshot(context.client, {
    minIntersectingPaneCount: verticalStackBeforeResize.intersectingHosts.length + 2,
    paneCount: verticalStackPaneCount,
    requiredFocusedPaneId: "vertical_pane_0",
  });
  await captureScreenshot(
    context.client,
    join(artifactDir, "vertical-stack-resized-live-panes.png"),
  );
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    clickPreservationChecks,
    constrainedMultiRowSnapshot,
    multiRowConstrainedViewport,
    multiRowSnapshot,
    multiRowViewport,
    rowNavigationSnapshot,
    snapshot,
    status: "passed",
    verticalResizeTarget,
    verticalStackAfterResize,
    verticalStackBeforeResize,
    verticalStackViewport,
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(
    `Electron workspace ultra-wide live panes passed: ${artifactDir} intersecting=${snapshot.intersectingHosts.length}`,
  );
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      snapshot: await safePaneSnapshot(context.client),
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
  const currentWorkspaceId = await client.driver("workspaceUltrawideWorkspaceId");
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return currentWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  return waitForWorkspaceDriverState(
    client,
    "workspaceUltrawideWorkspaceId",
    {},
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function persistUltraWideLayout(client, workspaceId) {
  await persistLayout(client, ultraWideLayout(workspaceId));
}

async function persistMultiRowLayout(client, workspaceId) {
  await persistLayout(client, multiRowLayout(workspaceId));
}

async function persistVerticalStackLayout(client, workspaceId) {
  await persistLayout(client, verticalStackLayout(workspaceId));
}

async function persistLayout(client, layout) {
  const result = await client.driver("workspaceUltrawideSaveUILayout", { layout });
  if (!result.ok) {
    throw new Error(`workspace UI layout was not persisted: ${JSON.stringify(result)}`);
  }
}

async function waitForLivePaneSnapshot(
  client,
  {
    expectedIntersectingPaneCount,
    maxIntersectingPaneCount = Number.POSITIVE_INFINITY,
    minIntersectingPaneCount = expectedIntersectingPaneCount,
    paneCount,
    requiredFocusedPaneId = "",
    requiredIntersectingPaneId = "",
  },
) {
  const options = {
    expectedIntersectingPaneCount,
    maxIntersectingPaneCount,
    minIntersectingPaneCount,
    paneCount,
    requiredFocusedPaneId,
    requiredIntersectingPaneId,
  };
  return waitForWorkspaceDriverState(
    client,
    "workspaceUltrawidePaneSnapshot",
    {},
    (snapshot) => paneSnapshotMatches(snapshot, options),
    workflowTimeoutMs,
  );
}

function paneSnapshotMatches(snapshot, options) {
  return (
    paneSnapshotStructureMatches(snapshot, options) &&
    paneSnapshotRequiredPanesMatch(snapshot, options) &&
    paneSnapshotHostsAreLive(snapshot) &&
    paneSnapshotSurvivorKindsMatch(snapshot)
  );
}

function paneSnapshotStructureMatches(snapshot, options) {
  return (
    snapshot.workspaceMode === "workspace" &&
    snapshot.totalPanes === options.paneCount &&
    intersectingPaneCountMatches(snapshot.intersectingHosts.length, options)
  );
}

function intersectingPaneCountMatches(count, options) {
  if (options.expectedIntersectingPaneCount !== undefined) {
    return count === options.expectedIntersectingPaneCount;
  }
  return count >= options.minIntersectingPaneCount && count <= options.maxIntersectingPaneCount;
}

function paneSnapshotRequiredPanesMatch(snapshot, options) {
  return (
    requiredFocusedPaneMatches(snapshot, options.requiredFocusedPaneId) &&
    requiredIntersectingPaneMatches(snapshot, options.requiredIntersectingPaneId)
  );
}

function requiredFocusedPaneMatches(snapshot, paneId) {
  return paneId === "" || snapshot.focusedPaneId === paneId;
}

function requiredIntersectingPaneMatches(snapshot, paneId) {
  return paneId === "" || snapshot.intersectingHosts.some((host) => host.paneId === paneId);
}

function paneSnapshotHostsAreLive(snapshot) {
  return snapshot.intersectingHosts.every(
    (host) =>
      host.runtimeState === "live" &&
      host.pointerEvents === "auto" &&
      host.surfaceId !== "" &&
      host.surfaceKind !== "",
  );
}

function paneSnapshotSurvivorKindsMatch(snapshot) {
  const surfaceKinds = new Set(snapshot.intersectingHosts.map((host) => host.surfaceKind));
  return (
    surfaceKinds.has("easy-button") &&
    surfaceKinds.has("empty-frame") &&
    snapshot.intersectingHosts.every(
      (host) => host.surfaceKind === "easy-button" || host.surfaceKind === "empty-frame",
    )
  );
}

async function waitForVerticalResizeTarget(client, { adjacentPaneId, paneId }) {
  const snapshot = await waitForWorkspaceDriverState(
    client,
    "workspaceUltrawidePaneSnapshot",
    {},
    (candidate) =>
      candidate.resizeHandles.some(
        (handle) =>
          handle.axis === "vertical" &&
          handle.adjacentPaneId === adjacentPaneId &&
          handle.paneId === paneId,
      ) &&
      candidate.intersectingHosts.some((host) => host.paneId === paneId) &&
      candidate.intersectingHosts.some((host) => host.paneId === adjacentPaneId),
    workflowTimeoutMs,
  );
  const handle = snapshot.resizeHandles.find(
    (candidate) =>
      candidate.axis === "vertical" &&
      candidate.adjacentPaneId === adjacentPaneId &&
      candidate.paneId === paneId,
  );
  if (!handle) {
    throw new Error(`missing vertical resize handle: ${JSON.stringify(snapshot)}`);
  }
  return {
    handle,
    snapshot,
  };
}

async function waitForWorkspaceDriverState(client, method, args, isReady, timeoutMs) {
  await client.installDriver();
  return waitForState(client, driverCallExpression(method, args), isReady, timeoutMs);
}

async function dispatchWorkspaceNavigationShortcut(client, key) {
  await dispatchKeyEvent(client, {
    code: key,
    key,
    modifiers: cdpAltMetaModifier,
    type: "rawKeyDown",
  });
  await dispatchKeyEvent(client, {
    code: key,
    key,
    modifiers: cdpAltMetaModifier,
    type: "keyUp",
  });
}

async function safePaneSnapshot(client) {
  try {
    return await client.driver("workspaceUltrawidePaneSnapshot");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function assertVisiblePaneClickFocusesWithoutReveal(client, snapshot, surfaceKind) {
  const target = snapshot.intersectingHosts.find(
    (host) => host.surfaceKind === surfaceKind && !host.focused,
  );
  if (!target) {
    throw new Error(`no unfocused visible ${surfaceKind} host was available`);
  }
  await dispatchMouseClick(client, {
    x: Math.round((target.rect.left + target.rect.right) / 2),
    y: Math.round(target.rect.top + target.rect.height / 2),
  });
  await delay(100);
  const afterClick = await client.driver("workspaceUltrawidePaneSnapshot");
  if (afterClick.focusedPaneId !== target.paneId) {
    throw new Error(
      `${surfaceKind} click did not focus the clicked pane: ${JSON.stringify({
        after: afterClick.focusedPaneId,
        expected: target.paneId,
        paneId: target.paneId,
      })}`,
    );
  }
  if (Math.abs(afterClick.stageRect.left - snapshot.stageRect.left) > 1) {
    throw new Error(
      `${surfaceKind} click revealed the clicked pane instead of preserving scroll position: ${JSON.stringify(
        {
          afterLeft: afterClick.stageRect.left,
          beforeLeft: snapshot.stageRect.left,
          paneId: target.paneId,
        },
      )}`,
    );
  }
  return {
    focusedPaneId: afterClick.focusedPaneId,
    paneId: target.paneId,
    scrollPreserved: true,
    surfaceKind,
  };
}

function ultraWideLayout(workspaceId) {
  const panes = Array.from({ length: paneCount }, (_value, index) => {
    const surfaceKind = productSurfaceKindForPane(index);
    return {
      columnId: `workspace_column_${index}`,
      easyButtonConfig: null,
      heat: (index * 37) % 100,
      paneId: `workspace_pane_${index}`,
      sequence: index,
      subtitle: "ultra-wide visibility fixture",
      surfaceId: `workspace_surface_${index}`,
      surfaceKind,
      title: `Pane ${String(index + 1).padStart(2, "0")}`,
      tone: ["cyan", "green", "orange", "pink", "slate"][index % 5],
      weight: 1,
    };
  });
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
    focusedPaneId: "workspace_pane_0",
    panes,
    schemaVersion: 1,
    workspaceId,
  };
}

function multiRowLayout(workspaceId) {
  const panes = Array.from({ length: multiRowPaneCount }, (_value, index) => {
    const columnIndex = Math.floor(index / 2);
    const rowIndex = index % 2;
    const surfaceKind = multiRowSurfaceKind(columnIndex, rowIndex);
    return {
      columnId: `multirow_column_${columnIndex}`,
      easyButtonConfig: null,
      heat: (index * 41) % 100,
      paneId: `multirow_pane_${index}`,
      sequence: index,
      subtitle: "multi-row visibility fixture",
      surfaceId: `multirow_surface_${index}`,
      surfaceKind,
      title: `Row ${rowIndex + 1} Pane ${columnIndex + 1}`,
      tone: ["cyan", "green", "orange", "pink", "slate"][index % 5],
      weight: 1,
    };
  });
  return {
    columns: Array.from({ length: multiRowPaneCount / 2 }, (_value, index) => ({
      columnId: `multirow_column_${index}`,
      idealWidthSpec: { unit: "px", value: 520 },
      index,
      paneIds: [`multirow_pane_${index * 2}`, `multirow_pane_${index * 2 + 1}`],
      planeIndex: 0,
      previousProportionWidth: null,
      slotIndex: index,
      widthSpec: { unit: "px", value: 520 },
    })),
    focusedPaneId: "multirow_pane_0",
    panes,
    schemaVersion: 1,
    workspaceId,
  };
}

function verticalStackLayout(workspaceId) {
  const panes = Array.from({ length: verticalStackPaneCount }, (_value, index) => {
    const surfaceKind = verticalStackSurfaceKind(index);
    return {
      columnId: "vertical_stack_column_0",
      easyButtonConfig: null,
      heat: (index * 29) % 100,
      paneId: `vertical_pane_${index}`,
      sequence: index,
      subtitle: "vertical stack row-height fixture",
      surfaceId: `vertical_surface_${index}`,
      surfaceKind,
      title: `Vertical Pane ${String(index + 1).padStart(2, "0")}`,
      tone: ["cyan", "green", "orange", "pink", "slate"][index % 5],
      weight: index === 0 ? 50 : 1,
    };
  });
  return {
    columns: [
      {
        columnId: "vertical_stack_column_0",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 0,
        paneIds: panes.map((pane) => pane.paneId),
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
    ],
    focusedPaneId: "vertical_pane_0",
    panes,
    schemaVersion: 1,
    workspaceId,
  };
}

function productSurfaceKindForPane(index) {
  return ["empty-frame", "easy-button"][index % 2];
}

function multiRowSurfaceKind(columnIndex, rowIndex) {
  return (columnIndex + rowIndex) % 2 === 0 ? "empty-frame" : "easy-button";
}

function verticalStackSurfaceKind(index) {
  return ["empty-frame", "easy-button"][index % 2];
}
