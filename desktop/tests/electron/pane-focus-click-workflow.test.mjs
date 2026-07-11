#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";

import { backendProbe } from "./chat-workflow-harness.mjs";
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

  await writeJson(join(artifactDir, "summary.json"), {
    afterContentLayout: afterContentState.layout,
    afterTopBarLayout: afterTopBarState.layout,
    artifactDir,
    beforeContentLayout,
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
  const layout = twoPaneWorkspaceUILayout(workspaceId);
  const saved = await backend.post("/workspaces/ui/layout/save", { layout });
  if (saved.workspaceId !== workspaceId) {
    throw new Error(
      `saved layout workspace ${saved.workspaceId} did not match opened workspace ${workspaceId}`,
    );
  }
  return workspaceId;
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
    paneFocusWorkflowStateExpression(),
    label,
    (state) => state.ok && predicate(state),
    summarizePaneFocusState,
  );
}

async function readPaneFocusState(client) {
  return client.evaluate(paneFocusWorkflowStateExpression());
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
  return client.evaluate(paneClickPointExpression(paneId, targetKind));
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

function twoPaneWorkspaceUILayout(workspaceId) {
  return {
    columns: [
      {
        columnId: "workspace_column_0",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 0,
        paneIds: ["workspace_pane_0"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
      {
        columnId: "workspace_column_1",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 1,
        paneIds: ["workspace_pane_1"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 1,
        widthSpec: { unit: "px", value: 520 },
      },
    ],
    focusedPaneId: "workspace_pane_0",
    panes: [
      {
        columnId: "workspace_column_0",
        heat: 0,
        paneId: "workspace_pane_0",
        sequence: 0,
        subtitle: "workspace graph",
        surfaceId: "workspace_surface_0",
        surfaceKind: "workflow-graph",
        terminalConfig: null,
        title: "Workflow Graph",
        tone: "cyan",
        weight: 1,
      },
      {
        columnId: "workspace_column_1",
        heat: 37,
        paneId: "workspace_pane_1",
        sequence: 1,
        subtitle: "terminal",
        surfaceId: "workspace_surface_1",
        surfaceKind: "terminal",
        terminalConfig: {
          cwdOverride: "",
          profileId: "default",
          titleOverride: "",
        },
        title: "Terminal",
        tone: "green",
        weight: 1,
      },
    ],
    schemaVersion: 1,
    workspaceId,
  };
}

function paneFocusWorkflowStateExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    if (!(area instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
      return { ok: false, reason: "missing-workspace-layout" };
    }
    const layoutResult = globalThis.__settaE2EDriver?.layoutState
      ? globalThis.__settaE2EDriver.layoutState()
      : { ok: false, reason: "driver-missing" };
    if (!layoutResult.ok) {
      return { ok: false, reason: layoutResult.reason ?? "layout-state-unavailable" };
    }
    const elementRect = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    };
    const rectInsideRect = (inner, outer) =>
      inner.width > 0 &&
      inner.height > 0 &&
      inner.left >= outer.left &&
      inner.right <= outer.right &&
      inner.top >= outer.top &&
      inner.bottom <= outer.bottom;
    const elementIntersectsViewport = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight;
    };
    const stageRect = elementRect(stage);
    const layout = {
      ...layoutResult.snapshot,
      workspaceId: area.dataset.workspaceId ?? "",
    };
    const panes = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.visible === "true")
      .map((host) => {
        const rect = elementRect(host);
        const topBar = host.querySelector(".workspace-pane-top-bar");
        const hasTopBar = topBar instanceof HTMLElement;
        const closeButton = host.querySelector('[data-workspace-pane-action="close"]');
        return {
          closeClickable: closeButton instanceof HTMLButtonElement && !closeButton.disabled,
          focused: host.dataset.focused === "true",
          hasTopBar,
          paneId: host.dataset.paneId ?? "",
          rect,
          stageContained: rectInsideRect(rect, stageRect),
          surfaceKind: host.dataset.surfaceKind ?? "",
          terminalReady: Boolean(host.querySelector(".xterm-helper-textarea")),
          topBarClickable: hasTopBar && elementIntersectsViewport(topBar),
          visible: host.dataset.visible === "true",
        };
      });
    const scenario = (${paneFocusScenarioFromPanes.toString()})(panes);
    if (scenario.ok) {
      const terminal = panes.find((pane) => pane.paneId === scenario.terminalPaneId);
      const focusAway = panes.find((pane) => pane.paneId === scenario.focusAwayPaneId);
      scenario.minimal = panes.length === 2 &&
        Boolean(terminal?.stageContained) &&
        Boolean(focusAway?.stageContained);
    }
    return {
      layout,
      ok: true,
      panes,
      scenario,
      stageRect,
    };
  })()`;
}

function paneClickPointExpression(paneId, targetKind) {
  return `(() => {
    const paneId = ${JSON.stringify(paneId)};
    const targetKind = ${JSON.stringify(targetKind)};
    const elementRect = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    };
    const elementIntersectsViewport = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight;
    };
    const host = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]')).find(
      (candidate) =>
        candidate instanceof HTMLElement &&
        candidate.dataset.paneId === paneId &&
        candidate.dataset.visible === "true",
    );
    if (!(host instanceof HTMLElement)) {
      return { ok: false, reason: "missing-visible-pane-host" };
    }
    const target =
      targetKind === "top-bar"
        ? host.querySelector(".workspace-pane-top-bar")
        : host.dataset.surfaceKind === "terminal"
          ? (host.querySelector(".workspace-xterm-viewport") ?? host.querySelector(".xterm-screen"))
          : host;
    if (!(target instanceof HTMLElement)) {
      return {
        ok: false,
        reason: targetKind === "top-bar" ? "missing-pane-top-bar" : "missing-pane-content",
        rect: elementRect(host),
      };
    }
    if (!elementIntersectsViewport(target)) {
      return {
        ok: false,
        reason:
          targetKind === "top-bar" ? "pane-top-bar-outside-viewport" : "pane-content-outside-viewport",
        rect: elementRect(target),
      };
    }
    const rect = target.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 8), window.innerWidth - 8);
    const y = Math.min(
      Math.max(
        rect.top + (targetKind === "top-bar" ? Math.min(15, rect.height / 2) : rect.height / 2),
        8,
      ),
      window.innerHeight - 8,
    );
    return {
      ok: true,
      x,
      y,
    };
  })()`;
}

function paneFocusScenarioFromPanes(panes) {
  const rectsVerticallyOverlap = (left, right) =>
    left.rect.height > 0 &&
    right.rect.height > 0 &&
    Math.max(left.rect.top, right.rect.top) < Math.min(left.rect.bottom, right.rect.bottom);
  const rectCenterX = (pane) => pane.rect.left + pane.rect.width / 2;
  const terminals = panes
    .filter(
      (pane) =>
        pane.surfaceKind === "terminal" &&
        pane.stageContained &&
        pane.terminalReady &&
        pane.hasTopBar,
    )
    .toSorted((left, right) => Number(right.focused) - Number(left.focused));
  for (const terminal of terminals) {
    const focusAway = panes
      .filter(
        (pane) =>
          pane.paneId !== terminal.paneId &&
          pane.surfaceKind !== "terminal" &&
          pane.topBarClickable &&
          rectsVerticallyOverlap(pane, terminal),
      )
      .toSorted(
        (left, right) =>
          Number(right.stageContained) - Number(left.stageContained) ||
          Math.abs(rectCenterX(left) - rectCenterX(terminal)) -
            Math.abs(rectCenterX(right) - rectCenterX(terminal)),
      )
      .at(0);
    if (focusAway) {
      return {
        focusAwayPaneId: focusAway.paneId,
        minimal: false,
        ok: true,
        terminalPaneId: terminal.paneId,
      };
    }
  }
  return { ok: false, reason: "missing-contained-terminal-and-clickable-focus-away-pane" };
}
