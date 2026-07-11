import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  appendWorkflowState,
  waitForBackendState,
  waitForState,
} from "./chat-workflow-harness.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";
import { activityWorkflowGraph } from "./workflow-activity-feed-fixtures.mjs";

const settingsTrajectoryPrompt = "chat activity projection reload workflow";
const activeSettingsTrajectoryPrompt = "workflow hold for queue and steering";

export async function assertWorkflowAgentRunSettingsSnapshot(client, workspaceId, recordingDir) {
  const defaults = await rendererChat(client, "readCodexDefaults", []);
  const model = defaults.models[0] ?? null;
  const defaultPreset = permissionPreset(defaults, "default");
  const readOnlyPreset = permissionPreset(defaults, "read-only");
  if (model === null) {
    throw new Error(`chat defaults did not include a model: ${JSON.stringify(defaults)}`);
  }
  const graph = activityWorkflowGraph(settingsTrajectoryPrompt, {
    activitySettings: {
      model: "",
      permission: permissionSettingsFromPreset(readOnlyPreset),
      reasoningEffort: null,
    },
    agentDefaults: {
      model: model.model,
      permission: permissionSettingsFromPreset(defaultPreset),
      reasoningEffort: null,
    },
  });
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`settings trajectory workflow graph invalid: ${JSON.stringify(validation)}`);
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Node trajectory run settings",
    "Verifies workflow-agent effective run settings snapshots.",
    graph,
  ]);
  const graphSurfaceId = await openWorkflowGraphForDefinition(client, workspaceId, definition.id);
  const startedRun = await startWorkflowRunFromToolbar(
    client,
    graphSurfaceId,
    workspaceId,
    definition.id,
  );
  const completed = await waitForWorkflowExecution(
    client,
    workspaceId,
    startedRun.executionId,
    (execution) => execution.status === "completed",
  );
  const activityNode = latestNodeExecution(completed, "activity");
  if (!activityNode) {
    throw new Error(`settings workflow missing activity node: ${JSON.stringify(completed)}`);
  }
  const trajectory = await rendererWorkflow(client, "readNodeTrajectory", [
    {
      beforeBlockOrdinal: 0,
      executionId: completed.id,
      nodeExecutionId: activityNode.id,
      outputLimit: 2,
      transcriptLimit: 5,
      workspaceId,
    },
  ]);
  assertWorkflowAgentRunSettings(trajectory.runSettings, {
    model,
    nodeExecution: activityNode,
    permissionPreset: readOnlyPreset,
  });
  assertWorkflowAgentRunSettings(activityNode.agentRunSettings, {
    model,
    nodeExecution: activityNode,
    permissionPreset: readOnlyPreset,
  });
  const runGraph = await ensureWorkflowRunProjection(
    client,
    startedRun.graphSurfaceId,
    definition.id,
    startedRun.executionId,
  );
  await openWorkflowNodeRunDetails(client, startedRun.graphSurfaceId, runGraph, "activity");
  await waitForState(client, driverCallExpression("workflowRunDetailsState"), (state) =>
    completedWorkflowRunSettingsSnapshotReady(state, {
      model,
      permissionPreset: readOnlyPreset,
      reasoningEffortDisplayName: trajectory.runSettings.reasoningEffortDisplayName,
    }),
  );
  await assertActiveWorkflowAgentRunSettingsComposer(client, workspaceId, {
    defaultPreset,
    model,
    readOnlyPreset,
    recordingDir,
  });
  await appendWorkflowState(recordingDir, {
    executionId: completed.id,
    nodeExecutionId: activityNode.id,
    type: "workflow_agent_run_settings_snapshot_verified",
  });
}

async function assertActiveWorkflowAgentRunSettingsComposer(
  client,
  workspaceId,
  { defaultPreset, model, readOnlyPreset, recordingDir },
) {
  const graph = activityWorkflowGraph(activeSettingsTrajectoryPrompt, {
    activitySettings: {
      model: "",
      permission: permissionSettingsFromPreset(readOnlyPreset),
      reasoningEffort: null,
    },
    agentDefaults: {
      model: model.model,
      permission: permissionSettingsFromPreset(defaultPreset),
      reasoningEffort: null,
    },
  });
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`active settings workflow graph invalid: ${JSON.stringify(validation)}`);
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Node trajectory active run settings",
    "Verifies workflow-agent active composer run settings placement.",
    graph,
  ]);
  const graphSurfaceId = await openWorkflowGraphForDefinition(client, workspaceId, definition.id);
  const startedRun = await startWorkflowRunFromToolbar(
    client,
    graphSurfaceId,
    workspaceId,
    definition.id,
  );
  const running = await waitForWorkflowExecution(
    client,
    workspaceId,
    startedRun.executionId,
    workflowActivityNodeRunning,
  );
  const activityNode = latestNodeExecution(running, "activity");
  if (!activityNode) {
    throw new Error(`active settings workflow missing activity node: ${JSON.stringify(running)}`);
  }
  assertWorkflowAgentRunSettings(activityNode.agentRunSettings, {
    model,
    nodeExecution: activityNode,
    permissionPreset: readOnlyPreset,
  });
  const runGraph = await ensureWorkflowRunProjection(
    client,
    startedRun.graphSurfaceId,
    definition.id,
    startedRun.executionId,
  );
  await openWorkflowNodeRunDetails(client, startedRun.graphSurfaceId, runGraph, "activity");
  await waitForState(client, driverCallExpression("workflowRunDetailsState"), (state) =>
    activeWorkflowRunSettingsSnapshotReady(state, {
      model,
      permissionPreset: readOnlyPreset,
      reasoningEffortDisplayName: activityNode.agentRunSettings.reasoningEffortDisplayName,
    }),
  );
  await rendererWorkflow(client, "stopNodeRun", [
    {
      executionId: running.id,
      nodeExecutionId: activityNode.id,
      workspaceId,
    },
  ]);
  await waitForWorkflowExecution(client, workspaceId, running.id, (execution) => {
    const nodeExecution = latestNodeExecution(execution, "activity");
    return execution.status === "cancelled" && nodeExecution?.status === "cancelled";
  });
  await appendWorkflowState(recordingDir, {
    executionId: running.id,
    nodeExecutionId: activityNode.id,
    type: "workflow_agent_active_run_settings_layout_verified",
  });
}

function completedWorkflowRunSettingsSnapshotReady(state, expected) {
  if (!workflowRunDetailsSettingsBaseReady(state)) {
    return false;
  }
  return workflowRunSettingsToolbarReady(state.composerSettings, {
    ...expected,
    composerMode: "read-only-settings",
    textareaExpected: false,
  });
}

function activeWorkflowRunSettingsSnapshotReady(state, expected) {
  if (!workflowRunDetailsSettingsBaseReady(state)) {
    return false;
  }
  return workflowRunSettingsToolbarReady(state.composerSettings, {
    ...expected,
    composerMode: "",
    textareaExpected: true,
  });
}

function workflowRunDetailsSettingsBaseReady(state) {
  return (
    state.settingsBarCount === 0 &&
    state.standaloneSettingsBarCount === 0 &&
    state.nodeStatusChipCount === 1
  );
}

function workflowRunSettingsToolbarReady(settingsBar, expected) {
  return Object.values(workflowRunSettingsToolbarEvidence(settingsBar, expected)).every(Boolean);
}

function workflowRunSettingsToolbarEvidence(settingsBar, expected) {
  return {
    buttonLabels: workflowRunSettingsButtonLabelsReady(settingsBar, expected),
    buttonTitles: workflowRunSettingsButtonTitlesReady(settingsBar),
    buttonsDisabled: workflowRunSettingsButtonsDisabled(settingsBar),
    composerMode: settingsBar.composerMode === expected.composerMode,
    readOnly: settingsBar.readOnly,
    textareaPlacement: workflowRunSettingsTextareaPlacementReady(settingsBar, expected),
  };
}

function workflowRunSettingsButtonLabelsReady(settingsBar, expected) {
  return (
    settingsBar.permissionButtonText.includes(expected.permissionPreset.label) &&
    settingsBar.modelButtonText.includes(expected.model.displayName) &&
    settingsBar.modelButtonText.includes(expected.reasoningEffortDisplayName)
  );
}

function workflowRunSettingsButtonTitlesReady(settingsBar) {
  return (
    settingsBar.permissionButtonTitle === "Run settings are read-only." &&
    settingsBar.modelButtonTitle === "Run settings are read-only."
  );
}

function workflowRunSettingsButtonsDisabled(settingsBar) {
  return settingsBar.permissionButtonDisabled && settingsBar.modelButtonDisabled;
}

function workflowRunSettingsTextareaPlacementReady(settingsBar, expected) {
  if (settingsBar.textareaExists !== expected.textareaExpected) {
    return false;
  }
  return !expected.textareaExpected || settingsBar.textareaBeforeToolbar;
}

async function openWorkflowGraphForDefinition(client, workspaceId, definitionId) {
  const definition = await rendererWorkflow(client, "readDefinition", [workspaceId, definitionId]);
  await reloadRendererWithSelectedWorkspace(client, workspaceId);
  await selectWorkflowDefinitionFromSidebar(client, definition.name);
  await openWorkflowGraphPane(client);
  const surfaceId = await maximizeWorkflowGraphPane(client);
  await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.viewMode === "draft",
  );
  return surfaceId;
}

async function selectWorkflowDefinitionFromSidebar(client, definitionName) {
  await waitForState(
    client,
    driverCallExpression("workflowDefinitionSidebarItemState", { name: definitionName }),
    (state) => state.exists && state.disabled === false,
  );
  const clicked = await client.driver("clickWorkflowDefinitionSidebarItem", {
    name: definitionName,
  });
  if (!clicked.clicked) {
    throw new Error(
      `workflow definition sidebar row was not clickable: ${JSON.stringify({
        definitionName,
        clicked,
      })}`,
    );
  }
  await waitForState(
    client,
    driverCallExpression("workflowDefinitionSidebarItemState", { name: definitionName }),
    (state) => state.selected === true,
  );
}

async function reloadRendererWithSelectedWorkspace(client, workspaceId) {
  await client.call("Page.enable");
  const pageLoaded = waitForPageLoadEvent(client, 20_000);
  try {
    await client.call("Page.reload", { ignoreCache: true });
  } catch (error) {
    if (!isRendererNavigationError(error)) {
      throw error;
    }
  }
  await pageLoaded;
  const startedAt = Date.now();
  let lastError = null;
  let lastState = null;
  while (Date.now() - startedAt < 20_000) {
    try {
      lastState = await client.driver("rendererWorkspace");
      if (lastState.workspaceId === workspaceId) {
        return;
      }
    } catch (error) {
      lastError = error;
      if (!isRendererNavigationError(error)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(
    `renderer workflow API did not recover after reload: ${JSON.stringify({
      lastError: lastError instanceof Error ? lastError.message : String(lastError),
      lastState,
    })}`,
  );
}

function waitForPageLoadEvent(client, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    let dispose = () => {};
    const timeout = globalThis.setTimeout(() => {
      dispose();
      reject(new Error("renderer reload did not emit Page.loadEventFired"));
    }, timeoutMs);
    dispose = client.on("Page.loadEventFired", () => {
      globalThis.clearTimeout(timeout);
      dispose();
      resolvePromise();
    });
  });
}

function isRendererNavigationError(error) {
  return error instanceof Error && error.message.includes("Inspected target navigated or closed");
}

async function startWorkflowRunFromToolbar(client, surfaceId, workspaceId, definitionId) {
  const before = await rendererWorkflow(client, "listExecutions", [workspaceId, definitionId, 20]);
  const beforeExecutionIds = new Set(before.executions.map((execution) => execution.id));
  await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.viewMode === "draft",
  );
  await waitForState(
    client,
    driverCallExpression("workflowToolbarButtonState", { testId: "workflow-run-button" }),
    (state) => state.exists && !state.disabled && state.text.includes("Run"),
  );
  const clicked = await client.driver("clickWorkflowToolbarButton", {
    testId: "workflow-run-button",
  });
  if (!clicked.ok) {
    throw new Error(`workflow run button was not clickable: ${JSON.stringify(clicked)}`);
  }
  const started = await waitForWorkflowExecutionSummary(
    client,
    workspaceId,
    definitionId,
    (execution) => !beforeExecutionIds.has(execution.id),
  );
  const graphSnapshot = await ensureWorkflowRunProjection(
    client,
    surfaceId,
    definitionId,
    started.id,
  );
  return {
    executionId: started.id,
    graphSnapshot,
    graphSurfaceId: surfaceId,
  };
}

async function ensureWorkflowRunProjection(client, surfaceId, definitionId, executionId) {
  const navigation = await waitForWorkflowRunNavigationState(
    client,
    surfaceId,
    definitionId,
    executionId,
  );
  if (!navigation.runProjectionMatches && !navigation.selectedRunMatches) {
    if (navigation.viewActiveRunReady) {
      const activeRunClicked = await client.driver("clickWorkflowToolbarButton", {
        testId: "workflow-view-active-run-button",
      });
      if (!activeRunClicked.ok) {
        throw new Error(
          `workflow active-run button was not clickable: ${JSON.stringify(activeRunClicked)}`,
        );
      }
    } else {
      await selectWorkflowRunProjection(client, executionId);
    }
  }
  await waitForWorkflowRunNavigationState(
    client,
    surfaceId,
    definitionId,
    executionId,
    (value) => value.runProjectionMatches || value.selectedRunMatches,
  );
  return waitForWorkflowGraphSnapshot(client, surfaceId, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === "activity"),
  );
}

async function waitForWorkflowExecutionSummary(client, workspaceId, definitionId, isReady) {
  const response = await waitForBackendState(
    async () => rendererWorkflow(client, "listExecutions", [workspaceId, definitionId, 20]),
    (value) => value.executions.some(isReady),
  );
  const execution = response.executions.find(isReady);
  if (!execution) {
    throw new Error(`workflow execution summary disappeared: ${JSON.stringify(response)}`);
  }
  return execution;
}

async function selectWorkflowRunProjection(client, executionId) {
  await waitForState(
    client,
    driverCallExpression("workflowRunSelectorState"),
    (state) => state.buttonExists && !state.buttonDisabled,
  );
  const opened = await client.driver("openWorkflowRunSelector");
  if (!opened.ok) {
    throw new Error(`workflow run selector did not open: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    driverCallExpression("workflowRunSelectorState"),
    (state) =>
      state.menuOpen &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${executionId}`),
  );
  const selected = await client.driver("selectWorkflowRunSelectorRow", { executionId });
  if (!selected.ok) {
    throw new Error(`workflow run selector row did not select: ${JSON.stringify(selected)}`);
  }
}

async function waitForWorkflowRunNavigationState(
  client,
  surfaceId,
  definitionId,
  executionId,
  isReady = (value) =>
    value.runProjectionMatches ||
    value.selectedRunMatches ||
    value.viewActiveRunReady ||
    value.runSelectorReady,
) {
  return waitForState(
    client,
    driverCallExpression("workflowGraphRunNavigationState", {
      definitionId,
      executionId,
      surfaceId,
    }),
    (value) => value.ready && isReady(value),
  );
}

async function openWorkflowNodeRunDetails(
  client,
  surfaceId,
  snapshot,
  nodeId,
  nodeExecutionId = "",
) {
  if (!snapshot.graph.nodes.some((candidate) => candidate.id === nodeId)) {
    throw new Error(`workflow graph node ${nodeId} missing: ${JSON.stringify(snapshot.graph)}`);
  }
  const opened = await client.driver("openWorkflowNodeDetailsFromGraphDebug", {
    nodeExecutionId,
    nodeId,
    surfaceId,
  });
  if (!opened.ok) {
    throw new Error(`workflow node details did not open: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    driverCallExpression("workflowRunDetailsState"),
    (state) =>
      state.present &&
      state.workflowTrajectorySurfaceCount === 1 &&
      state.chatConversationTrajectoryCount === 0,
  );
}

async function waitForWorkflowGraphSnapshot(client, surfaceId, predicate) {
  const state = await waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      includeVisual: false,
      surfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
  );
  return state.snapshot;
}

async function waitForWorkflowExecution(client, workspaceId, executionId, isReady) {
  return waitForBackendState(
    async () => rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    isReady,
  );
}

function latestNodeExecution(execution, nodeId) {
  const matches = execution.nodeExecutions.filter((node) => node.nodeId === nodeId);
  return matches[matches.length - 1] ?? null;
}

function workflowActivityNodeRunning(execution) {
  const nodeExecution = latestNodeExecution(execution, "activity");
  return execution.status === "running" && nodeExecution?.status === "running";
}

function permissionPreset(defaults, presetId) {
  const preset = defaults.permissionPresets.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new Error(
      `chat defaults missing permission preset ${presetId}: ${JSON.stringify(defaults)}`,
    );
  }
  return preset;
}

function permissionSettingsFromPreset(preset) {
  return {
    approvalPolicy: preset.approvalPolicy,
    permissions: preset.activePermissionProfileId,
    preset: preset.id,
  };
}

function assertWorkflowAgentRunSettings(settings, { model, nodeExecution, permissionPreset }) {
  const expected = {
    approvalPolicy: permissionPreset.approvalPolicy,
    model: model.model,
    modelDisplayName: model.displayName,
    modelSource: "workflow",
    permissionDisplayLabel: permissionPreset.label,
    permissionProfileId: permissionPreset.activePermissionProfileId,
    permissionPreset: permissionPreset.id,
    permissionSource: "node",
    permissions: permissionPreset.activePermissionProfileId,
    reasoningEffortSource: "default",
  };
  const mismatches = Object.entries(expected).filter(([key, value]) => settings?.[key] !== value);
  if (mismatches.length > 0) {
    throw new Error(
      `workflow-agent run settings mismatch: ${JSON.stringify({
        expected,
        mismatches,
        nodeExecutionId: nodeExecution.id,
        settings,
      })}`,
    );
  }
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function rendererChat(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}
