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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "workspace-ultrawide-live-panes";
const workflowTimeoutMs = 30_000;
const cdpAltMetaModifier = 5;
const paneCount = 24;
const expectedIntersectingPaneCount = 23;
const multiRowPaneCount = 12;
const multiRowExpectedIntersectingPaneCount = 12;
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
    await assertVisiblePaneClickPreservesWorkspaceFocus(
      context.client,
      multiRowSnapshot,
      "terminal",
    ),
    await assertVisiblePaneClickPreservesWorkspaceFocus(
      context.client,
      multiRowSnapshot,
      "workflow-graph",
    ),
  ];
  await captureScreenshot(context.client, join(artifactDir, "multirow-live-panes.png"));
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

async function persistUltraWideLayout(client, workspaceId) {
  await persistLayout(client, ultraWideLayout(workspaceId));
}

async function persistMultiRowLayout(client, workspaceId) {
  await persistLayout(client, multiRowLayout(workspaceId));
}

async function persistLayout(client, layout) {
  const result = await client.evaluate(`(async () => {
    const layout = ${JSON.stringify(layout)};
    await window.setta.workspace.saveUILayout(layout);
    const readback = await window.setta.workspace.readUILayout(layout.workspaceId);
    return {
      ok: readback.layout?.panes?.length === layout.panes.length,
      readbackPaneCount: readback.layout?.panes?.length ?? 0,
    };
  })()`);
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
  return waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => {
      const terminalHosts = snapshot.intersectingHosts.filter(
        (host) => host.surfaceKind === "terminal",
      );
      const workflowHosts = snapshot.intersectingHosts.filter(
        (host) => host.surfaceKind === "workflow-graph",
      );
      return (
        snapshot.workspaceMode === "workspace" &&
        snapshot.totalPanes === paneCount &&
        (expectedIntersectingPaneCount === undefined ||
          snapshot.intersectingHosts.length === expectedIntersectingPaneCount) &&
        snapshot.intersectingHosts.length >= minIntersectingPaneCount &&
        snapshot.intersectingHosts.length <= maxIntersectingPaneCount &&
        (requiredFocusedPaneId === "" || snapshot.focusedPaneId === requiredFocusedPaneId) &&
        (requiredIntersectingPaneId === "" ||
          snapshot.intersectingHosts.some((host) => host.paneId === requiredIntersectingPaneId)) &&
        snapshot.intersectingHosts.every((host) => host.runtimeState === "live") &&
        snapshot.intersectingHosts.every((host) => host.pointerEvents === "auto") &&
        snapshot.intersectingHosts.every((host) => host.surfaceId !== "") &&
        snapshot.intersectingHosts.every((host) => host.surfaceKind !== "") &&
        terminalHosts.length > 0 &&
        terminalHosts.every((host) => host.hasTerminalViewport && host.terminalStatus !== "") &&
        workflowHosts.length > 0 &&
        terminalHosts.every((host) => host.terminalSessionId.startsWith("terminal_")) &&
        workflowHosts.every((host) => host.hasWorkflowGraphHost && host.hasWorkflowGraphSurface)
      );
    },
    workflowTimeoutMs,
  );
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
    return await client.evaluate(paneSnapshotExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function assertVisiblePaneClickPreservesWorkspaceFocus(client, snapshot, surfaceKind) {
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
  const afterClick = await client.evaluate(paneSnapshotExpression());
  if (afterClick.focusedPaneId !== snapshot.focusedPaneId) {
    throw new Error(
      `${surfaceKind} click moved workspace focus: ${JSON.stringify({
        after: afterClick.focusedPaneId,
        before: snapshot.focusedPaneId,
        paneId: target.paneId,
      })}`,
    );
  }
  return {
    focusedPaneId: snapshot.focusedPaneId,
    paneId: target.paneId,
    preserved: true,
    surfaceKind,
  };
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function paneSnapshotExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    const stageRect = stage instanceof HTMLElement
      ? stage.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    const hosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.visible === "true")
      .map((host) => {
        const rect = host.getBoundingClientRect();
        const style = getComputedStyle(host);
        return {
          focused: host.dataset.focused === "true",
          hasTerminalViewport: Boolean(host.querySelector('[data-terminal-viewport="true"]')),
          hasWorkflowGraphHost: Boolean(host.querySelector('[data-testid="workflow-graph"]')),
          hasWorkflowGraphSurface: Boolean(
            host.querySelector('[data-testid="workspace-workflow-graph-surface"]')
          ),
          paneId: host.dataset.paneId ?? "",
          pointerEvents: style.pointerEvents,
          rect: {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          },
          runtimeState: host.dataset.runtimeState ?? "",
          surfaceId: host.dataset.surfaceId ?? "",
          surfaceKind: host.dataset.surfaceKind ?? "",
          terminalStatus:
            host.querySelector('[data-terminal-status="true"]')?.textContent?.trim() ?? "",
          terminalSessionId: host.dataset.terminalSessionId ?? "",
        };
      });
    const intersectingHosts = hosts.filter(
      (host) =>
        host.rect.left < stageRect.right &&
        host.rect.right > stageRect.left &&
        host.rect.top < stageRect.bottom &&
        host.rect.bottom > stageRect.top,
    );
    return {
      focusedPaneId: hosts.find((host) => host.focused)?.paneId ?? "",
      intersectingHosts,
      mode: area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "",
      runtimeStates: hosts.reduce((states, host) => {
        states[host.runtimeState] = (states[host.runtimeState] ?? 0) + 1;
        return states;
      }, {}),
      stageRect: {
        height: stageRect.height,
        bottom: stageRect.bottom,
        left: stageRect.left,
        right: stageRect.right,
        top: stageRect.top,
        width: stageRect.width,
      },
      totalPanes: Number(area instanceof HTMLElement ? area.dataset.paneCount ?? "0" : "0"),
      visibleHosts: hosts,
      workspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "",
      workspaceMode: area instanceof HTMLElement ? area.dataset.workspaceMode ?? "" : "",
    };
  })()`;
}

function ultraWideLayout(workspaceId) {
  const panes = Array.from({ length: paneCount }, (_value, index) => {
    const surfaceKind = productSurfaceKindForPane(index);
    return {
      columnId: `workspace_column_${index}`,
      heat: (index * 37) % 100,
      paneId: `workspace_pane_${index}`,
      sequence: index,
      subtitle: "ultra-wide visibility fixture",
      surfaceId: `workspace_surface_${index}`,
      surfaceKind,
      terminalConfig:
        surfaceKind === "terminal"
          ? {
              cwdOverride: "",
              profileId: "",
              titleOverride: "",
            }
          : null,
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
      heat: (index * 41) % 100,
      paneId: `multirow_pane_${index}`,
      sequence: index,
      subtitle: "multi-row visibility fixture",
      surfaceId: `multirow_surface_${index}`,
      surfaceKind,
      terminalConfig:
        surfaceKind === "terminal"
          ? {
              cwdOverride: "",
              profileId: "",
              titleOverride: "",
            }
          : null,
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

function productSurfaceKindForPane(index) {
  return ["chat-dom", "empty-frame", "workflow-graph", "terminal"][index % 4];
}

function multiRowSurfaceKind(columnIndex, rowIndex) {
  if (rowIndex === 1) {
    return columnIndex % 2 === 0 ? "terminal" : "workflow-graph";
  }
  return ["chat-dom", "workflow-graph", "terminal"][columnIndex % 3];
}
