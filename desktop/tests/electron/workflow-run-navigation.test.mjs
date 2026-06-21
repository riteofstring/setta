/* global console */

import { join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";
import { createWorkflowProjectionFixture } from "./workflow-projection-smoke-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const scriptedNavigationPrompt = "workflow hold for draft event";
const narrowToolbarViewport = { deviceScaleFactor: 1, height: 720, mobile: false, width: 760 };

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/workflow-run-navigation.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("workflow-run-navigation");
await writeLatestRecordingPointer("workflow-run-navigation", artifactDir);
const fixture = await createElectronFixture("workflow-run-navigation");
let context = null;
let workflowGraphSurfaceId;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
    },
    fixture,
    visible: options.visible,
  });

  const projection = await createWorkflowProjectionFixture(context.client, fixture.workspaceRoot);
  await setWorkflowActionPrompt(
    context.client,
    projection.workspaceId,
    projection.definitionId,
    scriptedNavigationPrompt,
  );
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await openWorkflowGraphPane(context.client);
  await waitForSelector(context.client, '[data-testid="workflow-graph"]');
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client);
  await waitForWorkflowDraft(context.client, workflowGraphSurfaceId, projection.definitionId);
  await waitForToolbarButtonState(context.client, "workflow-run-button", (state) => {
    return state.exists && !state.disabled && state.text.includes("Run");
  });
  await captureScreenshot(context.client, join(artifactDir, "draft-no-active-run.png"));

  const firstExecutionId = await startWorkflowRunFromToolbar(
    context.client,
    workflowGraphSurfaceId,
    projection.definitionId,
  );
  await clickWorkflowToolbarButton(context.client, "workflow-show-draft-button");
  await waitForWorkflowDraft(context.client, workflowGraphSurfaceId, projection.definitionId);
  await waitForToolbarButtonState(context.client, "workflow-run-button", (state) => !state.exists);
  await waitForToolbarButtonState(context.client, "workflow-view-active-run-button", (state) => {
    return state.exists && !state.disabled && state.text.includes("View Active Run");
  });
  const firstRunningWhileDraft = await waitForWorkflowExecution(
    context.client,
    projection.workspaceId,
    firstExecutionId,
    runningWorkflowReady,
  );
  const draftOrdinal = firstRunningWhileDraft.lastEventOrdinal;
  await beginWorkflowEventCapture(context.client, firstExecutionId);
  await steerHiddenWorkflowRun(
    context.client,
    projection.workspaceId,
    firstRunningWhileDraft,
    "event while viewing draft",
  );
  await waitForCapturedWorkflowEventAfter(context.client, draftOrdinal);
  await waitForWorkflowExecution(
    context.client,
    projection.workspaceId,
    firstExecutionId,
    (run) => run.status === "running" && run.lastEventOrdinal > draftOrdinal,
  );
  const draftWhileActive = await getWorkflowGraphSnapshot(context.client, workflowGraphSurfaceId);
  assertDraftProjection(draftWhileActive, projection.definitionId);
  await waitForToolbarButtonState(context.client, "workflow-view-active-run-button", (state) => {
    return state.exists && !state.disabled && state.text.includes("View Active Run");
  });
  await captureScreenshot(context.client, join(artifactDir, "draft-active-run.png"));

  await clickWorkflowToolbarButton(context.client, "workflow-view-active-run-button");
  await waitForRunProjection(
    context.client,
    workflowGraphSurfaceId,
    projection.definitionId,
    firstExecutionId,
    "running",
  );
  await waitForToolbarButtonState(context.client, "workflow-stop-button", (state) => {
    return state.exists && !state.disabled && state.text.includes("Stop");
  });
  await captureScreenshot(context.client, join(artifactDir, "active-run-view.png"));

  await stopWorkflowRun(context.client, projection.workspaceId, firstExecutionId);
  await clickWorkflowToolbarButton(context.client, "workflow-show-draft-button");
  await waitForWorkflowDraft(context.client, workflowGraphSurfaceId, projection.definitionId);
  await waitForToolbarButtonState(context.client, "workflow-run-button", (state) => {
    return state.exists && !state.disabled && state.text.includes("Run");
  });

  const secondExecutionId = await startWorkflowRunFromToolbar(
    context.client,
    workflowGraphSurfaceId,
    projection.definitionId,
  );
  await clickWorkflowToolbarButton(context.client, "workflow-show-draft-button");
  await waitForWorkflowDraft(context.client, workflowGraphSurfaceId, projection.definitionId);
  await waitForToolbarButtonState(context.client, "workflow-view-active-run-button", (state) => {
    return state.exists && !state.disabled && state.text.includes("View Active Run");
  });
  await openWorkflowRunSelector(context.client);
  const activeHistorySelector = await waitForRunSelectorState(
    context.client,
    (state) =>
      state.menuOpen &&
      state.rows.length >= 2 &&
      state.rows[0]?.testId === `workflow-run-selector-row-${secondExecutionId}` &&
      state.rows[0]?.text.includes("Running") &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${firstExecutionId}`),
  );
  await captureScreenshot(context.client, join(artifactDir, "run-selector-active-history.png"));
  await selectWorkflowRunSelectorRow(context.client, secondExecutionId);
  await waitForRunProjection(
    context.client,
    workflowGraphSurfaceId,
    projection.definitionId,
    secondExecutionId,
    "running",
  );
  await stopWorkflowRun(context.client, projection.workspaceId, secondExecutionId);

  await waitForRunSelectorState(
    context.client,
    (state) => state.buttonExists && !state.buttonDisabled,
  );
  await openWorkflowRunSelector(context.client);
  await waitForRunSelectorState(
    context.client,
    (state) =>
      state.menuOpen &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${firstExecutionId}`) &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${secondExecutionId}`),
  );
  await selectWorkflowRunSelectorRow(context.client, firstExecutionId);
  const historicalProjection = await waitForRunProjection(
    context.client,
    workflowGraphSurfaceId,
    projection.definitionId,
    firstExecutionId,
    "cancelled",
  );
  await captureScreenshot(context.client, join(artifactDir, "historical-run-selected.png"));

  await context.client.call("Emulation.setDeviceMetricsOverride", narrowToolbarViewport);
  await openWorkflowRunSelector(context.client);
  const narrowSelector = await waitForRunSelectorState(
    context.client,
    (state) =>
      state.menuOpen &&
      state.toolbarVisible &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${firstExecutionId}`) &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${secondExecutionId}`),
  );
  await captureScreenshot(context.client, join(artifactDir, "run-selector-narrow-toolbar.png"));

  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    activeHistorySelector,
    firstExecutionId,
    historicalWorkflow: historicalProjection.graph.workflow,
    narrowSelector,
    secondExecutionId,
  });

  console.log(`workflow run navigation passed: ${artifactDir}`);
} finally {
  await stopElectronCdpContext(context);
  if (!options.keepArtifacts && fixture?.tempRoot) {
    await import("node:fs/promises").then(({ rm }) =>
      rm(fixture.tempRoot, { force: true, recursive: true }),
    );
  }
}

async function setWorkflowActionPrompt(client, workspaceId, definitionId, prompt) {
  const result = await client.evaluate(`(async () => {
    const definition = await window.setta.workflow.readDefinition(
      ${JSON.stringify(workspaceId)},
      ${JSON.stringify(definitionId)}
    );
    const graph = {
      ...definition.graph,
      nodes: definition.graph.nodes.map((node) => {
        if (node.id !== "work") {
          return node;
        }
        return {
          ...node,
          action: {
            ...node.action,
            codex: {
              ...node.action.codex,
              prompt: ${JSON.stringify(prompt)},
            },
          },
        };
      }),
    };
    await window.setta.workflow.updateDefinition(
      ${JSON.stringify(workspaceId)},
      ${JSON.stringify(definitionId)},
      definition.name,
      definition.description,
      graph
    );
    return { ok: true };
  })()`);
  if (!result?.ok) {
    throw new Error(`workflow prompt update failed: ${JSON.stringify(result)}`);
  }
}

async function startWorkflowRunFromToolbar(client, surfaceId, definitionId) {
  await waitForToolbarButtonState(client, "workflow-run-button", (state) => {
    return state.exists && !state.disabled && state.text.includes("Run");
  });
  await clickWorkflowToolbarButton(client, "workflow-run-button");
  const runProjection = await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.viewMode === "run" &&
      snapshot.graph.workflow?.executionId !== "",
  );
  return runProjection.graph.workflow.executionId;
}

async function stopWorkflowRun(client, workspaceId, executionId) {
  await waitForToolbarButtonState(client, "workflow-stop-button", (state) => {
    return state.exists && !state.disabled && state.text.includes("Stop");
  });
  await clickWorkflowToolbarButton(client, "workflow-stop-button");
  await waitForWorkflowExecution(client, workspaceId, executionId, (run) => {
    return run.status === "cancelled";
  });
}

async function waitForWorkflowDraft(client, surfaceId, definitionId) {
  return waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.viewMode === "draft" &&
      snapshot.graph.workflow?.executionId === "",
  );
}

async function waitForRunProjection(client, surfaceId, definitionId, executionId, status) {
  return waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.viewMode === "run" &&
      snapshot.graph.workflow?.executionId === executionId &&
      snapshot.graph.workflow?.executionStatus === status,
  );
}

async function waitForWorkflowGraphSnapshot(client, surfaceId, predicate, timeoutMs = 20_000) {
  const state = await waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      includeVisual: false,
      surfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
    timeoutMs,
  );
  return state.snapshot;
}

async function getWorkflowGraphSnapshot(client, surfaceId) {
  await client.installDriver();
  return client.driver("workflowGraphDebugSnapshot", {
    includeVisual: false,
    surfaceId,
  });
}

async function waitForWorkflowExecution(client, workspaceId, executionId, predicate) {
  return waitForState(
    client,
    `window.setta.workflow.readExecution(${JSON.stringify(workspaceId)}, ${JSON.stringify(executionId)})`,
    predicate,
    20_000,
  );
}

async function waitForToolbarButtonState(client, testId, predicate) {
  return waitForState(client, workflowToolbarButtonStateExpression(testId), predicate);
}

function workflowToolbarButtonStateExpression(testId) {
  return `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
    return {
      disabled: button instanceof HTMLButtonElement ? button.disabled : true,
      exists: button instanceof HTMLButtonElement,
      text: button instanceof HTMLButtonElement ? button.textContent?.trim() ?? "" : "",
    };
  })()`;
}

async function clickWorkflowToolbarButton(client, testId) {
  await waitForToolbarButtonState(client, testId, (state) => state.exists && !state.disabled);
  await client.installDriver();
  const clicked = await client.driver("clickWorkflowToolbarButton", { testId });
  if (!clicked.ok) {
    throw new Error(`workflow toolbar button was not clickable: ${JSON.stringify(clicked)}`);
  }
}

async function openWorkflowRunSelector(client) {
  await client.installDriver();
  const opened = await client.driver("openWorkflowRunSelector");
  if (!opened.ok) {
    throw new Error(`workflow run selector did not open: ${JSON.stringify(opened)}`);
  }
}

async function selectWorkflowRunSelectorRow(client, executionId) {
  await client.installDriver();
  const selected = await client.driver("selectWorkflowRunSelectorRow", { executionId });
  if (!selected.ok) {
    throw new Error(`workflow run selector row did not select: ${JSON.stringify(selected)}`);
  }
}

async function waitForRunSelectorState(client, predicate) {
  await client.installDriver();
  return waitForState(client, driverCallExpression("workflowRunSelectorState"), predicate, 20_000);
}

function assertDraftProjection(snapshot, definitionId) {
  const workflow = snapshot.graph.workflow;
  if (
    workflow?.definitionId !== definitionId ||
    workflow.viewMode !== "draft" ||
    workflow.executionId !== ""
  ) {
    throw new Error(`graph did not stay on draft target: ${JSON.stringify(workflow)}`);
  }
}

async function beginWorkflowEventCapture(client, executionId) {
  await client.evaluate(`(() => {
    if (typeof window.__workflowRunNavigationUnsubscribe === "function") {
      window.__workflowRunNavigationUnsubscribe();
    }
    window.__workflowRunNavigationCapturedEvents = [];
    window.__workflowRunNavigationUnsubscribe = window.setta.workflow.onEvent((event) => {
      if (event.executionId === ${JSON.stringify(executionId)}) {
        window.__workflowRunNavigationCapturedEvents.push(event);
      }
    });
    return true;
  })()`);
}

async function waitForCapturedWorkflowEventAfter(client, ordinal) {
  await waitForState(
    client,
    `(() => (window.__workflowRunNavigationCapturedEvents ?? []).some((event) => event.ordinal > ${JSON.stringify(ordinal)}))()`,
    (captured) => captured === true,
    20_000,
  );
}

async function steerHiddenWorkflowRun(client, workspaceId, execution, prompt) {
  const nodeExecution = latestNodeExecution(execution, "work");
  const conversationId = runnerRef(nodeExecution, "chat.conversation");
  if (conversationId === "") {
    throw new Error(
      `workflow execution missing hidden chat conversation: ${JSON.stringify(execution)}`,
    );
  }
  await client.evaluate(`window.setta.chat.steerMessage(
    ${JSON.stringify(workspaceId)},
    ${JSON.stringify(conversationId)},
    ${JSON.stringify(prompt)}
  )`);
}

function runningWorkflowReady(execution) {
  const nodeExecution = latestNodeExecution(execution, "work");
  return (
    execution.status === "running" &&
    nodeExecution?.status === "running" &&
    runnerRef(nodeExecution, "chat.conversation") !== ""
  );
}

function latestNodeExecution(execution, nodeId) {
  return (
    execution.nodeExecutions
      .filter((nodeExecution) => nodeExecution.nodeId === nodeId)
      .sort((left, right) => right.attempt - left.attempt)[0] ?? null
  );
}

function runnerRef(nodeExecution, kind) {
  return nodeExecution?.runnerRefs.find((ref) => ref.kind === kind)?.id ?? "";
}
