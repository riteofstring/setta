#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";

import { backendProbe } from "./chat-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  dispatchMouseClick,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  terminalScrollbackSearchExpression,
  terminalSnapshotExpression,
  terminalSnapshotsExpression,
} from "./terminal-workflow-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;
const terminalContentClickCommand = "printf 'SETTA_PANE_CONTENT_CLICK_OK\\n'";
const terminalContentClickOutput = "SETTA_PANE_CONTENT_CLICK_OK";
const workspaceUILayoutEventSyncedTitle = "Workflow Graph Synced";
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1440,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/pane-focus-click-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("pane-focus-click-workflow");
await writeLatestRecordingPointer("pane-focus-click-workflow", artifactDir);
const fixture = await createElectronFixture("pane-focus-click-workflow");
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
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const seededWorkspaceId = await seedTwoPaneWorkspaceLayout(backend, fixture.workspaceRoot);
  await waitForWorkspaceLayoutArea(context.client);
  await openSeededWorkspaceInRenderer(context.client, seededWorkspaceId);
  const paneMetadata = await waitForWorkspacePaneMetadata(context.client, seededWorkspaceId);
  await waitForTerminalReady(context.client);
  const eventSyncedLayout = await applyWorkspaceUILayoutEventUpdate(backend, seededWorkspaceId);
  const eventSyncState = await waitForWorkspaceUILayoutEventSync(context.client, eventSyncedLayout);
  await waitForTerminalReady(context.client);
  await captureScreenshot(context.client, join(artifactDir, "before.png"));

  const { beforeContentState, scenario } = await prepareTwoPaneFocusScenario(context.client);
  const beforeContentLayout = beforeContentState.layout;

  await clickPaneContent(context.client, scenario.terminalPaneId);
  await waitForPaneFocusState(
    context.client,
    "terminal focused after content click",
    (state) => state.layout.focusedPaneId === scenario.terminalPaneId,
  );
  await sendTerminalCommand(context.client, scenario.terminalPaneId, terminalContentClickCommand);
  await waitForTerminalText(context.client, terminalContentClickOutput, scenario.terminalPaneId);
  const afterContentState = await readPaneFocusState(context.client);
  assertLayoutPositionUnchanged(
    beforeContentLayout,
    afterContentState.layout,
    "terminal content click",
  );
  if (afterContentState.layout.focusedPaneId !== scenario.terminalPaneId) {
    throw new Error(
      `terminal content click did not focus terminal: ${JSON.stringify(afterContentState)}`,
    );
  }
  await captureScreenshot(context.client, join(artifactDir, "after-content-click.png"));

  await clickPaneTopBar(context.client, scenario.focusAwayPaneId, "focus-away top-bar reveal");
  const afterTopBarState = await waitForPaneFocusState(
    context.client,
    "focus-away top-bar focused and settled",
    (state) =>
      state.layout.focusedPaneId === scenario.focusAwayPaneId &&
      layoutSettled(state.layout) &&
      state.scenario.ok &&
      state.scenario.terminalPaneId === scenario.terminalPaneId &&
      state.scenario.focusAwayPaneId === scenario.focusAwayPaneId,
  );
  await captureScreenshot(context.client, join(artifactDir, "after-top-click.png"));
  const resetLayout = await resetWorkspaceUILayoutThroughRenderer(
    context.client,
    seededWorkspaceId,
  );
  const resetState = await waitForWorkspaceUILayoutReset(context.client, resetLayout);

  await writeJson(join(artifactDir, "summary.json"), {
    afterContentLayout: afterContentState.layout,
    afterTopBarLayout: afterTopBarState.layout,
    artifactDir,
    beforeContentLayout,
    eventSyncState,
    paneMetadata,
    resetLayout,
    resetState,
    scenario,
    status: "passed",
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron pane focus click workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      snapshot: await safePaneFocusState(context.client),
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

async function waitForWorkspaceLayoutArea(client) {
  await waitForLoggedState(
    client,
    `(() => ({ ready: Boolean(document.querySelector('[data-testid="workspace-layout-area"]')) }))()`,
    "workspace layout area",
    (state) => state.ready,
    (state) => state,
  );
}

async function waitForTerminalReady(client) {
  return waitForLoggedState(
    client,
    terminalSnapshotsExpression(),
    "terminal ready",
    (snapshots) =>
      Array.isArray(snapshots) &&
      snapshots.some(
        (snapshot) =>
          snapshot.exists &&
          snapshot.visible &&
          snapshot.xtermReady &&
          snapshot.sessionId.startsWith("terminal_") &&
          snapshot.statusText !== "" &&
          snapshot.statusText !== "Starting shell" &&
          snapshot.titleText === snapshot.statusText,
      ),
    (snapshots) => ({
      terminals: Array.isArray(snapshots) ? snapshots.map(summarizeTerminalSnapshot) : snapshots,
    }),
  );
}

async function waitForWorkspacePaneMetadata(client, workspaceId) {
  return waitForLoggedState(
    client,
    workspacePaneMetadataExpression(),
    "workspace pane metadata",
    (metadata) =>
      metadata.workspaceId === workspaceId &&
      metadata.status === "loaded" &&
      metadata.layoutPresent &&
      metadata.count === 2 &&
      metadata.focusedPaneId === "workspace_pane_0" &&
      metadata.readableCount === 2 &&
      metadata.writableCount === 0,
    (metadata) => ({ ...metadata, expectedWorkspaceId: workspaceId }),
  );
}

async function openSeededWorkspaceInRenderer(client, workspaceId) {
  const initialState = await waitForLoggedState(
    client,
    seededWorkspaceOpenStateExpression(),
    "seeded workspace visible or open button",
    (state) => state.workspaceId === workspaceId || state.openButtonReady,
    (state) => ({ ...state, expectedWorkspaceId: workspaceId }),
  );
  if (initialState.workspaceId === workspaceId) {
    return;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  await waitForLoggedState(
    client,
    workspaceIdExpression(),
    "seeded workspace id",
    (renderedWorkspaceId) => renderedWorkspaceId === workspaceId,
    (renderedWorkspaceId) => ({ renderedWorkspaceId, workspaceId }),
  );
}

async function seedTwoPaneWorkspaceLayout(backend, workspaceRoot) {
  const opened = await backend.post("/workspaces/open", { rootPath: workspaceRoot });
  const workspaceId = opened.workspace?.id ?? "";
  if (workspaceId === "") {
    throw new Error(`workspace open response missing id: ${JSON.stringify(opened)}`);
  }
  const initialized = await backend.post("/workspaces/ui/layout/initialize", { workspaceId });
  if (initialized.workspaceId !== workspaceId) {
    throw new Error(
      `initialized layout workspace ${initialized.workspaceId} did not match opened workspace ${workspaceId}`,
    );
  }
  await backend.post("/workspaces/ui/panes/operation", {
    operation: paneOperation("close_pane", "workspace_pane_3", {
      close: { surfaceClose: "none" },
    }),
    workspaceId,
  });
  await backend.post("/workspaces/ui/panes/operation", {
    operation: paneOperation("close_pane", "workspace_pane_2", {
      close: { surfaceClose: "none" },
    }),
    workspaceId,
  });
  await backend.post("/workspaces/ui/panes/operation", {
    operation: paneOperation("configure_pane", "workspace_pane_0", {
      configure: {
        chatConfig: null,
        subtitle: "workspace graph",
        surfaceKind: "workflow-graph",
        terminalConfig: null,
        title: "Workflow Graph",
        tone: "cyan",
        workflowNodeDetailsConfig: null,
      },
    }),
    workspaceId,
  });
  return workspaceId;
}

async function applyWorkspaceUILayoutEventUpdate(backend, workspaceId) {
  const result = await backend.post("/workspaces/ui/panes/operation", {
    operation: paneOperation("rename_pane", "workspace_pane_0", {
      rename: { title: workspaceUILayoutEventSyncedTitle },
    }),
    workspaceId,
  });
  if (result.workspaceId !== workspaceId || result.layout?.workspaceId !== workspaceId) {
    throw new Error(
      `event-sync operation did not return the requested workspace layout: ${JSON.stringify(result)}`,
    );
  }
  return result.layout;
}

async function waitForWorkspaceUILayoutEventSync(client, expectedLayout) {
  return waitForLoggedState(
    client,
    workspaceUILayoutEventSyncExpression(expectedLayout.panes[0].paneId),
    "workspace UI layout event sync",
    (state) =>
      state.workspaceId === expectedLayout.workspaceId &&
      state.revision === expectedLayout.revision &&
      state.title === workspaceUILayoutEventSyncedTitle,
    (state) => ({
      ...state,
      expectedRevision: expectedLayout.revision,
      expectedTitle: workspaceUILayoutEventSyncedTitle,
      expectedWorkspaceId: expectedLayout.workspaceId,
    }),
  );
}

async function resetWorkspaceUILayoutThroughRenderer(client, workspaceId) {
  const resetLayout = await client.evaluate(`(async () => {
    return await window.setta.workspace.resetUILayout(${JSON.stringify(workspaceId)});
  })()`);
  if (
    resetLayout.workspaceId !== workspaceId ||
    resetLayout.revision <= 0 ||
    resetLayout.panes.length !== 4 ||
    resetLayout.columns.length !== 4
  ) {
    throw new Error(
      `workspace UI reset returned unexpected layout: ${JSON.stringify(resetLayout)}`,
    );
  }
  return resetLayout;
}

async function waitForWorkspaceUILayoutReset(client, expectedLayout) {
  return waitForLoggedState(
    client,
    driverCallExpression("workspaceUILayoutResetState"),
    "workspace UI layout reset",
    (state) =>
      state.ok &&
      state.workspaceId === expectedLayout.workspaceId &&
      state.revision === expectedLayout.revision &&
      state.paneCount === 4 &&
      state.focusedPaneId === expectedLayout.focusedPaneId &&
      state.surfaceKinds.includes("chat-dom") &&
      state.surfaceKinds.includes("terminal") &&
      state.surfaceKinds.includes("workflow-graph") &&
      state.surfaceKinds.includes("settings-dom"),
    (state) => ({
      ...state,
      expectedFocusedPaneId: expectedLayout.focusedPaneId,
      expectedRevision: expectedLayout.revision,
      expectedWorkspaceId: expectedLayout.workspaceId,
    }),
  );
}

async function prepareTwoPaneFocusScenario(client) {
  const twoPaneState = await waitForPaneFocusState(
    client,
    "minimal two-pane focus scenario",
    (state) => state.scenario.ok && state.scenario.minimal && layoutSettled(state.layout),
  );
  await clickPaneTopBar(client, twoPaneState.scenario.focusAwayPaneId, "focus-away setup");
  const beforeContentState = await waitForFocusAwayScenarioState(
    client,
    twoPaneState.scenario,
    "focus-away pane focused and settled",
  );
  return { beforeContentState, scenario: beforeContentState.scenario };
}

async function waitForFocusAwayScenarioState(client, scenario, label) {
  return waitForPaneFocusState(
    client,
    label,
    (state) =>
      state.layout.focusedPaneId === scenario.focusAwayPaneId &&
      layoutSettled(state.layout) &&
      state.scenario.ok &&
      state.scenario.minimal &&
      state.scenario.terminalPaneId === scenario.terminalPaneId &&
      state.scenario.focusAwayPaneId === scenario.focusAwayPaneId &&
      terminalReadyForWorkflowClick(state, scenario.terminalPaneId) &&
      focusAwayReadyForWorkflowClick(state, scenario.focusAwayPaneId),
  );
}

async function waitForPaneFocusState(client, label, predicate) {
  return waitForLoggedState(
    client,
    driverCallExpression("paneFocusWorkflowState"),
    label,
    (state) => state.ok && predicate(state),
    summarizePaneFocusState,
  );
}

async function readPaneFocusState(client) {
  return client.driver("paneFocusWorkflowState");
}

async function clickPaneTopBar(client, paneId, label) {
  const point = await paneClickPoint(client, paneId, "top-bar");
  if (!point.ok) {
    throw new Error(`${label} point unavailable: ${JSON.stringify(point)}`);
  }
  await dispatchMouseClick(client, point);
}

async function clickPaneContent(client, paneId) {
  const point = await paneClickPoint(client, paneId, "content");
  if (!point.ok) {
    throw new Error(`terminal content click point unavailable: ${JSON.stringify(point)}`);
  }
  await dispatchMouseClick(client, point);
}

async function paneClickPoint(client, paneId, targetKind) {
  return client.driver("paneClickPoint", { paneId, targetKind });
}

async function sendTerminalCommand(client, paneId, text) {
  await waitForLoggedState(
    client,
    terminalSnapshotExpression({ paneId }),
    "terminal focused for command",
    (snapshot) => snapshot.focused && snapshot.visible && snapshot.xtermReady,
    summarizeTerminalSnapshot,
  );
  await client.call("Input.insertText", { text });
  await pressTerminalEnter(client);
}

async function pressTerminalEnter(client) {
  await client.call("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    text: "\r",
    type: "keyDown",
    windowsVirtualKeyCode: 13,
  });
  await client.call("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    type: "keyUp",
    windowsVirtualKeyCode: 13,
  });
}

async function waitForTerminalText(client, expectedText, paneId) {
  return waitForLoggedState(
    client,
    terminalScrollbackSearchExpression(expectedText, { paneId }),
    `terminal text ${expectedText}`,
    (snapshot) => snapshot.found,
    summarizeTerminalSnapshot,
  );
}

async function waitForLoggedState(client, expression, label, predicate, summarize) {
  let lastLogAt = 0;
  return waitForState(
    client,
    expression,
    (value) => {
      if (predicate(value)) {
        return true;
      }
      const now = Date.now();
      if (now - lastLogAt >= 1_000) {
        console.log(`waiting for ${label}: ${JSON.stringify(summarize(value))}`);
        lastLogAt = now;
      }
      return false;
    },
    workflowTimeoutMs,
  );
}

function assertLayoutPositionUnchanged(before, after, label) {
  const beforePosition = layoutPosition(before);
  const afterPosition = layoutPosition(after);
  if (!layoutPositionsEqual(beforePosition, afterPosition)) {
    throw new Error(
      `${label} changed layout position: ${JSON.stringify({ after: afterPosition, before: beforePosition })}`,
    );
  }
}

function layoutSettled(layout) {
  return (
    nearlyEqual(layout.scrollColumn, layout.targetScrollColumn) &&
    nearlyEqual(layout.scrollRow, layout.targetScrollRow)
  );
}

function layoutPosition(layout) {
  return {
    scrollColumn: layout.scrollColumn,
    scrollRow: layout.scrollRow,
    targetScrollColumn: layout.targetScrollColumn,
    targetScrollRow: layout.targetScrollRow,
  };
}

function layoutPositionsEqual(left, right) {
  return (
    nearlyEqual(left.scrollColumn, right.scrollColumn) &&
    nearlyEqual(left.scrollRow, right.scrollRow) &&
    nearlyEqual(left.targetScrollColumn, right.targetScrollColumn) &&
    nearlyEqual(left.targetScrollRow, right.targetScrollRow)
  );
}

function terminalReadyForWorkflowClick(state, paneId) {
  return state.panes.some(
    (pane) => pane.paneId === paneId && pane.stageContained && pane.terminalReady,
  );
}

function focusAwayReadyForWorkflowClick(state, paneId) {
  return state.panes.some((pane) => pane.paneId === paneId && pane.topBarClickable);
}

function nearlyEqual(left, right) {
  return Math.abs(left - right) <= 0.001;
}

async function safePaneFocusState(client) {
  try {
    return await readPaneFocusState(client);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function summarizeTerminalSnapshot(snapshot) {
  return {
    exists: snapshot.exists,
    focused: snapshot.focused,
    found: snapshot.found,
    paneId: snapshot.paneId,
    sessionId: snapshot.sessionId,
    statusText: snapshot.statusText,
    visible: snapshot.visible,
    xtermReady: snapshot.xtermReady,
  };
}

function summarizePaneFocusState(state) {
  return {
    layout: state.layout,
    ok: state.ok,
    panes: state.panes?.map((pane) => ({
      focused: pane.focused,
      paneId: pane.paneId,
      stageContained: pane.stageContained,
      surfaceKind: pane.surfaceKind,
      terminalReady: pane.terminalReady,
      topBarClickable: pane.topBarClickable,
    })),
    reason: state.reason,
    scenario: state.scenario,
  };
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function workspacePaneMetadataExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    if (!(area instanceof HTMLElement)) {
      return { present: false };
    }
    return {
      count: Number(area.dataset.paneMetadataCount ?? "0"),
      focusedPaneId: area.dataset.paneMetadataFocusedPaneId ?? "",
      layoutPresent: area.dataset.paneMetadataLayoutPresent === "true",
      present: true,
      readableCount: Number(area.dataset.paneMetadataReadableCount ?? "0"),
      status: area.dataset.paneMetadataStatus ?? "",
      writableCount: Number(area.dataset.paneMetadataWritableCount ?? "0"),
      workspaceId: area.dataset.workspaceId ?? "",
    };
  })()`;
}

function seededWorkspaceOpenStateExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Open project folder",
    );
    return {
      openButtonReady: button instanceof HTMLButtonElement && !button.disabled,
      workspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "",
    };
  })()`;
}

function workspaceUILayoutEventSyncExpression(paneId) {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const readLayout = window.__settaWorkspaceReadLayoutState;
    const host = document.querySelector(
      \`[data-testid="workspace-pane-host"][data-pane-id="${paneId}"]\`,
    );
    const title = host?.querySelector("[data-workspace-pane-title]");
    return {
      present: area instanceof HTMLElement,
      revision: typeof readLayout === "function" ? readLayout().revision : -1,
      title: title instanceof HTMLElement ? title.textContent ?? "" : "",
      workspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "",
    };
  })()`;
}

function paneOperation(kind, paneId, fields = {}) {
  return {
    close: null,
    configure: null,
    kind,
    move: null,
    open: null,
    paneId,
    rename: null,
    reorder: null,
    resize: null,
    resizeColumn: null,
    ...fields,
  };
}
