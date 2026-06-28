#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
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
const paneCount = 24;
const expectedIntersectingPaneCount = 23;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 12000,
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

  const snapshot = await waitForUltraWideLivePaneSnapshot(context.client);
  await captureScreenshot(context.client, join(artifactDir, "ultrawide-live-panes.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
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
  const result = await client.evaluate(`(async () => {
    const layout = ${JSON.stringify(ultraWideLayout(workspaceId))};
    await window.setta.workspace.saveUILayout(layout);
    const readback = await window.setta.workspace.readUILayout(${JSON.stringify(workspaceId)});
    return {
      ok: readback.layout?.panes?.length === layout.panes.length,
      readbackPaneCount: readback.layout?.panes?.length ?? 0,
    };
  })()`);
  if (!result.ok) {
    throw new Error(`workspace UI layout was not persisted: ${JSON.stringify(result)}`);
  }
}

async function waitForUltraWideLivePaneSnapshot(client) {
  return waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) =>
      snapshot.workspaceMode === "workspace" &&
      snapshot.totalPanes === paneCount &&
      snapshot.intersectingHosts.length === expectedIntersectingPaneCount &&
      snapshot.intersectingHosts.every((host) => host.runtimeState === "live") &&
      snapshot.intersectingHosts.every((host) => host.pointerEvents === "auto") &&
      snapshot.intersectingHosts.every((host) => host.surfaceId !== "") &&
      snapshot.intersectingHosts.every((host) => host.surfaceKind !== ""),
    workflowTimeoutMs,
  );
}

async function safePaneSnapshot(client) {
  try {
    return await client.evaluate(paneSnapshotExpression());
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
          paneId: host.dataset.paneId ?? "",
          pointerEvents: style.pointerEvents,
          rect: {
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          },
          runtimeState: host.dataset.runtimeState ?? "",
          surfaceId: host.dataset.surfaceId ?? "",
          surfaceKind: host.dataset.surfaceKind ?? "",
        };
      });
    const intersectingHosts = hosts.filter(
      (host) => host.rect.left < stageRect.right && host.rect.right > stageRect.left,
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

function productSurfaceKindForPane(index) {
  return ["chat-dom", "empty-frame", "workflow-graph", "terminal"][index % 4];
}
