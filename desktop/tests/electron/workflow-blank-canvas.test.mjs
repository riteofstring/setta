/* global console */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  createElectronFixture,
  dispatchKeyEvent,
  dispatchMouseClick,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  dispatchWorkflowGraphContextMenu,
  dispatchWorkflowGraphMouseClick,
  dispatchWorkflowGraphMouseDrag,
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const visibleWorkflowSettingsSurfaceSelector =
  '[data-testid="workspace-pane-host"][data-surface-kind="workflow-settings"][data-surface-visible="true"][data-surface-frozen="false"][data-moving="false"] .workspace-react-dom-surface[data-react-surface-kind="workflow-settings"][data-visible="true"][data-frozen="false"] [data-testid="workflow-settings-surface"]';
const visibleWorkflowNodeDetailsSurfaceSelector =
  '[data-testid="workspace-pane-host"][data-surface-kind="workflow-node-details"][data-surface-visible="true"][data-surface-frozen="false"][data-moving="false"] .workspace-react-dom-surface[data-react-surface-kind="workflow-node-details"][data-visible="true"][data-frozen="false"] [data-testid="workflow-node-details-surface"]';
const workflowResultPrompt = "workflow result action";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/workflow-blank-canvas.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("workflow-blank-canvas");
await writeLatestRecordingPointer("workflow-blank-canvas", artifactDir);
const fixture = await createElectronFixture("workflow-blank-canvas");
let context = null;
let workflowGraphSurfaceId = null;

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

  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const workspaceId = await openWorkspace(context.client);
  await assertNullWorkflowValid(context.client, workspaceId);
  await openWorkflowGraphPane(context.client);
  await waitForSelector(context.client, '[data-testid="workflow-graph"]');
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client);
  const blankCanvas = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) => snapshot.graph.nodeCount === 0,
  );
  await dispatchWorkflowGraphMouseDrag(context.client, workflowGraphSurfaceId, {
    from: { x: 420, y: 320 },
    to: { x: 500, y: 380 },
  });
  const pannedCanvas = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 0 && cameraChanged(snapshot.camera, blankCanvas.camera),
  );
  const beforeDefinitions = await workflowDefinitions(context.client, workspaceId);
  if (beforeDefinitions.length !== 0) {
    throw new Error(
      `expected no workflow definitions before edit: ${JSON.stringify(beforeDefinitions)}`,
    );
  }
  const { body: bodyText } = await context.client.driver("bodyText");
  if (bodyText.includes("Create workflow")) {
    throw new Error(`blank workflow canvas exposed a create button: ${bodyText}`);
  }
  await waitForToolbarState(context.client, "Blank draft");

  await selectToolbarWorkflowNodeType(context.client, "start");
  await delay(150);
  const afterAdd = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 1 &&
      snapshot.graph.nodes[0]?.id === "start" &&
      snapshot.graph.workflow?.definitionName === "Untitled workflow",
  );
  if (afterAdd.graph.edgeCount !== 0) {
    throw new Error(
      `first node edit unexpectedly created edges: ${JSON.stringify(afterAdd.graph)}`,
    );
  }
  assertDraftWorkflowProjection(afterAdd, "Untitled workflow");
  assertCameraPreserved(afterAdd.camera, pannedCanvas.camera);
  await clickWorkflowRunButton(context.client);
  const invalidStart = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.workflow?.executionId === "" &&
      snapshot.graph.nodes.some(
        (node) =>
          node.id === "start" &&
          node.diagnostic?.severity === "error" &&
          node.diagnostic?.codes?.includes("start_node_output_required"),
      ),
  );
  await waitForSelector(context.client, '[data-testid="workflow-validation-panel"]');
  assertWorkflowNodeDiagnostic(invalidStart, "start", "start_node_output_required");

  const secondNodeMenuPoint = await dispatchWorkflowGraphContextMenu(
    context.client,
    workflowGraphSurfaceId,
    {
      x: 600,
      y: 260,
    },
  );
  await waitForSelector(context.client, '[data-testid="workflow-node-create-menu"]');
  await assertContextMenuAnchored(context.client, secondNodeMenuPoint);
  await selectWorkflowNodeType(context.client, "agent_task");
  await delay(150);
  const afterSecondNode = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 2 &&
      snapshot.graph.nodes.some((node) => node.id === "agent_task") &&
      snapshot.graph.nodes.every((node) => node.diagnostic === null),
  );
  await openAgentTaskDetailsFromToolbar(context.client, workflowGraphSurfaceId, afterSecondNode);
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client, {
    surfaceId: workflowGraphSurfaceId,
  });
  await waitForWorkflowGraphPaneSettled(context.client, workflowGraphSurfaceId);
  const afterDetails = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 2 &&
      snapshot.graph.nodes.some((node) => node.id === "agent_task") &&
      snapshot.canvas.clientWidth >= afterSecondNode.canvas.clientWidth &&
      snapshot.canvas.left >= 0,
  );
  await connectWorkflowGraphNodes(context.client, workflowGraphSurfaceId, afterDetails, {
    sourceNodeId: "start",
    targetNodeId: "agent_task",
  });
  const afterEdge = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.edgeCount === 1 &&
      snapshot.graph.edges[0]?.id === "start_agent_task" &&
      snapshot.graph.edges[0]?.sourceNodeId === "start" &&
      snapshot.graph.edges[0]?.targetNodeId === "agent_task",
  );
  assertCameraPreserved(afterEdge.camera, pannedCanvas.camera);

  const endPoint = offsetFromWorkflowGraphNode(afterEdge, "agent_task", { x: 260, y: 0 });
  await addWorkflowNodeAt(context.client, workflowGraphSurfaceId, "end", endPoint);
  await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 3 &&
      snapshot.graph.nodes.some((node) => node.id === "end") &&
      snapshot.graph.edges.some((edge) => edge.id === "start_agent_task"),
  );
  await clickWorkflowToolbarButton(context.client, "workflow-validate-button");
  await waitForWorkflowOperationStatus(context.client, "Issues found");
  const invalidAgentPath = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodes.some(
        (node) =>
          node.id === "agent_task" &&
          node.diagnostic?.codes?.includes("action_node_output_required"),
      ) && snapshot.graph.nodes.some((node) => node.id === "end"),
  );
  assertWorkflowNodeDiagnostic(invalidAgentPath, "agent_task", "action_node_output_required");

  await installDelayedWorkflowAddEdge(context.client, 1_000);
  await connectWorkflowGraphNodes(context.client, workflowGraphSurfaceId, invalidAgentPath, {
    sourceNodeId: "agent_task",
    targetNodeId: "end",
  });
  await waitForDelayedWorkflowAddEdgeCall(context.client);
  await clickWorkflowToolbarButton(context.client, "workflow-validate-button");
  await waitForWorkflowOperationStatus(context.client, "Validated");
  await restoreDelayedWorkflowAddEdge(context.client);
  const afterDelayedEdgeValidation = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodes.some((node) => node.id === "end" && node.diagnostic === null) &&
      snapshot.graph.edges.some(
        (edge) =>
          edge.id === "agent_task_end" &&
          edge.sourceNodeId === "agent_task" &&
          edge.targetNodeId === "end" &&
          edge.diagnostic === null,
      ),
  );
  assertCameraPreserved(afterDelayedEdgeValidation.camera, pannedCanvas.camera);

  const definitions = await workflowDefinitions(context.client, workspaceId);
  if (definitions.length !== 1 || definitions[0].name !== "Untitled workflow") {
    throw new Error(`workflow definitions after first edit = ${JSON.stringify(definitions)}`);
  }
  await assertSidebarWorkflowConversationSections(context.client);
  const saved = await readSavedWorkflowDefinition(fixture.workspaceRoot, definitions[0].id);
  if (
    saved.name !== "Untitled workflow" ||
    saved.graph.nodes[0]?.kind !== "start" ||
    saved.graph.nodes[1]?.kind !== "action" ||
    saved.graph.nodes[2]?.kind !== "end"
  ) {
    throw new Error(`saved workflow definition mismatch: ${JSON.stringify(saved)}`);
  }
  if (saved.graph.layout.nodes[0]?.nodeId !== "start") {
    throw new Error(
      `saved workflow layout missing start node: ${JSON.stringify(saved.graph.layout)}`,
    );
  }
  if (
    saved.graph.edges.length !== 2 ||
    saved.graph.edges[0]?.id !== "start_agent_task" ||
    saved.graph.edges[0]?.fromNodeId !== "start" ||
    saved.graph.edges[0]?.toNodeId !== "agent_task" ||
    saved.graph.edges[0]?.kind !== "normal" ||
    saved.graph.edges[0]?.condition !== null ||
    saved.graph.edges[1]?.id !== "agent_task_end" ||
    saved.graph.edges[1]?.fromNodeId !== "agent_task" ||
    saved.graph.edges[1]?.toNodeId !== "end" ||
    saved.graph.edges[1]?.kind !== "normal" ||
    saved.graph.edges[1]?.condition !== null
  ) {
    throw new Error(`saved workflow edge mismatch: ${JSON.stringify(saved.graph.edges)}`);
  }

  await deleteWorkflowEdgeWithKeyboard(
    context.client,
    workflowGraphSurfaceId,
    afterDelayedEdgeValidation,
    "start_agent_task",
  );
  const afterEdgeKeyboardDelete = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.edgeCount === 1 &&
      !snapshot.graph.edges.some((edge) => edge.id === "start_agent_task") &&
      snapshot.interaction.selectedEdgeIds.length === 0,
  );
  const afterEdgeDeleteSaved = await readSavedWorkflowDefinition(
    fixture.workspaceRoot,
    definitions[0].id,
  );
  if (afterEdgeDeleteSaved.graph.edges.some((edge) => edge.id === "start_agent_task")) {
    throw new Error(
      `keyboard-deleted workflow edge was saved: ${JSON.stringify(afterEdgeDeleteSaved.graph.edges)}`,
    );
  }
  await connectWorkflowGraphNodes(context.client, workflowGraphSurfaceId, afterEdgeKeyboardDelete, {
    sourceNodeId: "start",
    targetNodeId: "agent_task",
  });
  const afterEdgeKeyboardRestore = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.edgeCount === 2 &&
      snapshot.graph.edges.some((edge) => edge.id === "start_agent_task"),
  );
  assertCameraPreserved(afterEdgeKeyboardRestore.camera, pannedCanvas.camera);

  const renamedDefinition = await renameWorkflowFromSettings(
    context.client,
    workspaceId,
    definitions[0].id,
    "Greeting workflow",
    "Says hi",
  );
  if (
    renamedDefinition.id !== definitions[0].id ||
    renamedDefinition.name !== "Greeting workflow" ||
    renamedDefinition.description !== "Says hi"
  ) {
    throw new Error(`renamed workflow definition mismatch: ${JSON.stringify(renamedDefinition)}`);
  }
  const afterRenameDefinitions = await workflowDefinitions(context.client, workspaceId);
  if (
    afterRenameDefinitions.length !== 1 ||
    afterRenameDefinitions[0].name !== "Greeting workflow"
  ) {
    throw new Error(
      `workflow definitions after rename = ${JSON.stringify(afterRenameDefinitions)}`,
    );
  }
  const renamedSaved = await readSavedWorkflowDefinition(fixture.workspaceRoot, definitions[0].id);
  if (renamedSaved.name !== "Greeting workflow" || renamedSaved.description !== "Says hi") {
    throw new Error(`saved renamed workflow mismatch: ${JSON.stringify(renamedSaved)}`);
  }
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client, {
    surfaceId: workflowGraphSurfaceId,
  });
  await waitForWorkflowGraphPaneSettled(context.client, workflowGraphSurfaceId);
  await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) => snapshot.graph.workflow?.definitionName === "Greeting workflow",
  );

  await addWorkflowNodeAt(context.client, workflowGraphSurfaceId, "merge", { x: 720, y: 420 });
  const withDeletedCandidate = await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === "merge"),
  );
  await deleteWorkflowNodeWithKeyboard(
    context.client,
    workflowGraphSurfaceId,
    withDeletedCandidate,
    "merge",
  );
  const afterKeyboardDelete = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      !snapshot.graph.nodes.some((node) => node.id === "merge") && snapshot.graph.nodeCount === 3,
  );
  assertCameraPreserved(afterKeyboardDelete.camera, pannedCanvas.camera);
  const afterDeleteSaved = await readSavedWorkflowDefinition(
    fixture.workspaceRoot,
    definitions[0].id,
  );
  if (
    afterDeleteSaved.graph.nodes.some((node) => node.id === "merge") ||
    afterDeleteSaved.graph.layout.nodes.some((node) => node.nodeId === "merge")
  ) {
    throw new Error(
      `keyboard-deleted workflow node was saved: ${JSON.stringify(afterDeleteSaved)}`,
    );
  }

  await addWorkflowNodeAt(context.client, workflowGraphSurfaceId, "route", { x: 820, y: 260 });
  const routeOnly = await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === "route"),
  );
  const secondEndPoint = offsetFromWorkflowGraphNode(routeOnly, "route", { x: 220, y: 140 });
  await addWorkflowNodeAt(context.client, workflowGraphSurfaceId, "end", secondEndPoint);
  const routeNodes = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 5 &&
      snapshot.graph.nodes.some((node) => node.id === "route") &&
      snapshot.graph.nodes.some((node) => node.id === "end_2"),
  );
  assertRoutePorts(routeNodes);
  await connectWorkflowGraphNodes(context.client, workflowGraphSurfaceId, routeNodes, {
    sourceNodeId: "route",
    sourcePortId: "route_yes",
    targetNodeId: "end",
  });
  await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    snapshot.graph.edges.some(
      (edge) =>
        edge.id === "route_end" &&
        edge.label === "route=yes" &&
        edge.sourcePortId === "route_yes" &&
        edge.targetNodeId === "end",
    ),
  );
  const movedRoute = await moveWorkflowGraphNode(
    context.client,
    workflowGraphSurfaceId,
    routeNodes,
    "route",
    { x: 64, y: 36 },
  );
  const movedRoutePosition = workflowGraphNodeWorldPosition(movedRoute, "route");
  const beforeValidationToolbar = await workflowToolbarButtonRects(context.client);
  const validatingToolbar = await clickWorkflowValidateButtonAndReadNextFrame(context.client);
  assertWorkflowValidationToolbarStable(
    beforeValidationToolbar,
    validatingToolbar,
    "while validation is pending",
  );
  await waitForWorkflowOperationStatus(context.client, "Issues found");
  const diagnosedYesRoute = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      workflowGraphNodePositionMatches(snapshot, "route", movedRoutePosition) &&
      snapshot.graph.edges.some(
        (edge) =>
          edge.id === "route_end" &&
          edge.diagnostic?.severity === "error" &&
          edge.diagnostic?.codes?.includes("edge_condition_invalid"),
      ),
  );
  assertWorkflowGraphNodePosition(
    diagnosedYesRoute,
    "route",
    movedRoutePosition,
    "after validation",
  );
  const afterValidationToolbar = await workflowToolbarButtonRects(context.client);
  assertWorkflowValidationToolbarStable(
    beforeValidationToolbar,
    afterValidationToolbar,
    "after validation completes",
    { expectedStatus: "Issues found" },
  );
  assertWorkflowEdgeDiagnostic(diagnosedYesRoute, "route_end", "edge_condition_invalid");
  await connectWorkflowGraphNodes(context.client, workflowGraphSurfaceId, diagnosedYesRoute, {
    sourceNodeId: "agent_task",
    targetNodeId: "route",
  });
  const routeInput = await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    snapshot.graph.edges.some(
      (edge) =>
        edge.id === "agent_task_route" &&
        edge.sourceNodeId === "agent_task" &&
        edge.targetNodeId === "route",
    ),
  );
  await waitForWorkflowOperationStatus(context.client, "Stale");
  await connectWorkflowGraphNodes(context.client, workflowGraphSurfaceId, routeInput, {
    sourceNodeId: "route",
    sourcePortId: "route_default",
    targetNodeId: "end_2",
  });
  const typedRoute = await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    snapshot.graph.edges.some(
      (edge) =>
        edge.id === "route_end_2" &&
        edge.label === "default" &&
        edge.sourcePortId === "route_default" &&
        edge.targetNodeId === "end_2",
    ),
  );
  assertCameraPreserved(typedRoute.camera, pannedCanvas.camera);

  const routeDefinition = await configureWorkflowResultAction(
    context.client,
    workflowGraphSurfaceId,
    workspaceId,
    definitions[0].id,
  );
  assertSavedTypedRouteDefinition(routeDefinition);
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client, {
    surfaceId: workflowGraphSurfaceId,
  });
  await waitForWorkflowGraphPaneSettled(context.client, workflowGraphSurfaceId);
  await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === routeDefinition.id &&
      snapshot.graph.workflow?.draftRevision === routeDefinition.draftRevision,
  );
  const execution = await startWorkflowAndWaitForCompletion(
    context.client,
    workspaceId,
    routeDefinition.id,
  );
  assertTypedRouteExecution(execution);
  const completedRunGraph = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.workflow?.executionId === execution.id &&
      snapshot.graph.nodes.some((node) => node.id === "agent_task"),
  );
  assertRunWorkflowProjection(completedRunGraph, execution);

  await writeJson(join(artifactDir, "summary.json"), {
    definitionId: definitions[0].id,
    executionId: execution.id,
    status: "passed",
  });
  console.log(`Electron workflow blank canvas passed: ${artifactDir}`);
} catch (error) {
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function openWorkspace(client) {
  await waitForTexts(client, ["Shortcuts", "Projects"]);
  await clickButtonByAria(client, "Open project folder");
  await client.installDriver();
  const state = await waitForState(
    client,
    driverCallExpression("workflowWorkspaceSessionState"),
    (value) =>
      value.activeWorkspaceCount === 1 &&
      value.selectedWorkspaceId !== "" &&
      value.body.includes("workspace-root"),
  );
  return state.selectedWorkspaceId;
}

async function clickButtonByAria(client, label) {
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("buttonReady", { kind: "aria-label", value: label }),
    (value) => value.ready,
  );
  const clicked = await client.driver("clickButton", { kind: "aria-label", value: label });
  if (!clicked.clicked) {
    throw new Error(`button was not clickable: ${label}`);
  }
}

async function selectWorkflowNodeType(client, nodeType) {
  const selected = await client.driver("selectWorkflowNodeType", { nodeType });
  if (!selected.ok) {
    throw new Error(
      `failed to select ${nodeType} node from workflow context menu: ${JSON.stringify(selected)}`,
    );
  }
}

async function selectToolbarWorkflowNodeType(client, nodeType) {
  const opened = await client.driver("openWorkflowToolbarAddMenu");
  if (!opened.ok) {
    throw new Error(`failed to open toolbar add menu: ${JSON.stringify(opened)}`);
  }
  await waitForSelector(client, '[data-testid="workflow-toolbar-add-menu"]');
  const selected = await client.driver("selectWorkflowToolbarNodeType", { nodeType });
  if (!selected.ok) {
    throw new Error(
      `failed to select ${nodeType} node from workflow toolbar: ${JSON.stringify(selected)}`,
    );
  }
}

async function waitForToolbarState(client, expected) {
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("workflowToolbarState", { surfaceId: workflowGraphSurfaceId }),
    (value) => value.text === expected,
  );
}

async function clickWorkflowRunButton(client) {
  await clickWorkflowToolbarButton(client, "workflow-run-button");
}

async function clickWorkflowValidateButtonAndReadNextFrame(client) {
  const result = await client.driver("clickWorkflowToolbarButtonAndReadNextFrame", {
    testId: "workflow-validate-button",
  });
  if (!result.ok) {
    throw new Error(
      `workflow validate button was not clickable before geometry snapshot: ${JSON.stringify(result)}`,
    );
  }
  return result;
}

async function clickWorkflowToolbarButton(client, testId) {
  const clicked = await client.driver("clickWorkflowToolbarButton", {
    surfaceId: workflowGraphSurfaceId,
    testId,
  });
  if (!clicked.ok) {
    throw new Error(`workflow toolbar button was not clickable: ${JSON.stringify(clicked)}`);
  }
}

async function installDelayedWorkflowAddEdge(client, delayMs) {
  const installed = await client.evaluate(`(() => {
    if (!window.setta?.app?.flags?.workflowGraphDebug) {
      return false;
    }
    window.__settaWorkflowGraphAddEdgeDelayCalls = 0;
    window.__settaWorkflowGraphAddEdgeDelayMs = ${JSON.stringify(delayMs)};
    return true;
  })()`);
  if (!installed) {
    throw new Error("failed to install delayed workflow addEdge debug delay");
  }
}

async function waitForDelayedWorkflowAddEdgeCall(client) {
  await waitForState(
    client,
    "window.__settaWorkflowGraphAddEdgeDelayCalls ?? 0",
    (count) => count > 0,
  );
}

async function restoreDelayedWorkflowAddEdge(client) {
  await client.evaluate(`(() => {
    delete window.__settaWorkflowGraphAddEdgeDelayCalls;
    delete window.__settaWorkflowGraphAddEdgeDelayMs;
  })()`);
}

async function workflowToolbarButtonRects(client) {
  const result = await client.driver("workflowToolbarButtonRects");
  if (!result.ok) {
    throw new Error(`workflow toolbar rects unavailable: ${JSON.stringify(result)}`);
  }
  return result;
}

async function waitForWorkflowOperationStatus(client, expected) {
  await waitForState(
    client,
    driverCallExpression("workflowToolbarButtonRects"),
    (value) => value.ok && value.operationStatus?.text === expected,
  );
}

function assertWorkflowValidationToolbarStable(before, current, phase, options = {}) {
  assertWorkflowToolbarFrameStable(before, current, phase);
  assertWorkflowToolbarButtonsStable(before, current, phase);
  assertWorkflowValidateButtonStable(current, phase);
  assertWorkflowExpectedOperationStatus(current, phase, options.expectedStatus);
}

function assertWorkflowToolbarFrameStable(before, current, phase) {
  assertRectStable(before.toolbar, current.toolbar, `workflow toolbar ${phase}`);
  if (!before.operationStatus || !current.operationStatus) {
    throw new Error(`workflow operation status slot missing ${phase}`);
  }
  assertRectStable(
    before.operationStatus.rect,
    current.operationStatus.rect,
    `workflow operation status ${phase}`,
  );
}

function assertWorkflowToolbarButtonsStable(before, current, phase) {
  for (const testId of [
    "workflow-settings-button",
    "workflow-add-node-button",
    "workflow-validate-button",
    "workflow-run-button",
    "workflow-node-details-button",
  ]) {
    const beforeButton = before.buttons[testId];
    const currentButton = current.buttons[testId];
    if (!beforeButton || !currentButton) {
      throw new Error(`workflow toolbar button missing ${phase}: ${testId}`);
    }
    assertRectStable(beforeButton.rect, currentButton.rect, `${testId} ${phase}`);
    if (beforeButton.disabled !== currentButton.disabled) {
      throw new Error(
        `workflow toolbar button disabled state changed ${phase}: ${testId} before=${beforeButton.disabled} current=${currentButton.disabled}`,
      );
    }
  }
}

function assertWorkflowValidateButtonStable(current, phase) {
  const validateButton = current.buttons["workflow-validate-button"];
  if (validateButton.text !== "Validate") {
    throw new Error(
      `workflow validate button visual label changed ${phase}: ${validateButton.text}`,
    );
  }
  if (
    ![
      "Validate",
      "Validating workflow",
      "Workflow validated",
      "Workflow validation found issues",
      "Workflow changed since validation",
    ].includes(validateButton.ariaLabel)
  ) {
    throw new Error(
      `workflow validate button accessible label changed unexpectedly ${phase}: ${validateButton.ariaLabel}`,
    );
  }
}

function assertWorkflowExpectedOperationStatus(current, phase, expectedStatus) {
  if (expectedStatus && current.operationStatus.text !== expectedStatus) {
    throw new Error(
      `workflow validation status mismatch ${phase}: expected=${expectedStatus} current=${current.operationStatus.text}`,
    );
  }
}

function assertRectStable(before, current, label) {
  const tolerancePx = 1;
  for (const property of ["height", "left", "top", "width"]) {
    const delta = Math.abs(before[property] - current[property]);
    if (delta > tolerancePx) {
      throw new Error(
        `${label} ${property} shifted by ${delta}px: before=${JSON.stringify(before)} current=${JSON.stringify(current)}`,
      );
    }
  }
}

async function renameWorkflowFromSettings(client, workspaceId, definitionId, name, description) {
  await restoreMaximizedWorkflowGraphPane(client);
  await clickWorkflowToolbarButton(client, "workflow-settings-button");
  await waitForSelector(client, visibleWorkflowSettingsSurfaceSelector);
  await waitForSelector(
    client,
    `${visibleWorkflowSettingsSurfaceSelector} [data-testid="workflow-settings-name"]`,
  );
  await waitForSelector(
    client,
    `${visibleWorkflowSettingsSurfaceSelector} [data-testid="workflow-settings-description"]`,
  );
  await setWorkflowSettingsControlValue(client, '[data-testid="workflow-settings-name"]', name);
  await setWorkflowSettingsControlValue(
    client,
    '[data-testid="workflow-settings-description"]',
    description,
  );
  await clickWorkflowSettingsSaveButton(client);
  return waitForWorkflowDefinition(client, workspaceId, definitionId, (definition) => {
    return definition.name === name && definition.description === description;
  });
}

async function clickWorkflowSettingsSaveButton(client) {
  const result = await client.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(
      `${visibleWorkflowSettingsSurfaceSelector} [data-testid="workflow-settings-save-button"]`,
    )});
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  })()`);
  if (!result.clicked) {
    throw new Error("workflow settings save button was not clickable");
  }
}

async function clickWorkflowNodeDetailsSaveButton(client) {
  const result = await client.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(
      `${visibleWorkflowNodeDetailsSurfaceSelector} [data-testid="workflow-node-save-button"]`,
    )});
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  })()`);
  if (!result.clicked) {
    throw new Error("workflow node details save button was not clickable");
  }
}

async function restoreMaximizedWorkflowGraphPane(client) {
  const restored = await client.driver("restoreMaximizedWorkflowGraphPane");
  if (!restored) {
    return;
  }
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("workflowGraphPaneState"),
    (value) => !value.maximized && !value.moving,
  );
}

async function waitForWorkflowDefinition(client, workspaceId, definitionId, predicate) {
  return waitForState(
    client,
    `window.setta.workflow.readDefinition(${JSON.stringify(workspaceId)}, ${JSON.stringify(
      definitionId,
    )})`,
    predicate,
  );
}

async function setWorkflowSettingsControlValue(client, selector, value) {
  const result = await client.driver("setWorkflowSettingsControlValue", {
    selector,
    surfaceSelector: visibleWorkflowSettingsSurfaceSelector,
    value,
  });
  if (!result.ok) {
    throw new Error(`failed to set control ${selector}: ${JSON.stringify(result)}`);
  }
}

async function setWorkflowNodeDetailsControlValue(client, selector, value) {
  const result = await client.driver("setWorkflowSettingsControlValue", {
    selector,
    surfaceSelector: visibleWorkflowNodeDetailsSurfaceSelector,
    value,
  });
  if (!result.ok) {
    throw new Error(`failed to set node details control ${selector}: ${JSON.stringify(result)}`);
  }
}

async function addWorkflowNodeAt(client, surfaceId, nodeType, point) {
  const menuPoint = await dispatchWorkflowGraphContextMenu(client, surfaceId, point);
  await waitForSelector(client, '[data-testid="workflow-node-create-menu"]');
  await assertContextMenuAnchored(client, menuPoint);
  await selectWorkflowNodeType(client, nodeType);
  await delay(150);
}

async function deleteWorkflowNodeWithKeyboard(client, surfaceId, snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(
      `missing delete target node ${nodeId}: ${JSON.stringify(snapshot.graph.nodes)}`,
    );
  }
  await dispatchWorkflowGraphMouseClick(client, surfaceId, {
    x: node.screenX,
    y: node.screenY,
  });
  await waitForWorkflowGraphSnapshot(client, (selectedSnapshot) =>
    selectedSnapshot.interaction.selectedNodeIds.includes(nodeId),
  );
  await dispatchKeyEvent(client, { code: "Delete", key: "Delete" });
  await dispatchKeyEvent(client, { code: "Delete", key: "Delete", type: "keyUp" });
}

async function deleteWorkflowEdgeWithKeyboard(client, surfaceId, snapshot, edgeId) {
  const edge = snapshot.graph.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) {
    throw new Error(
      `missing delete target edge ${edgeId}: ${JSON.stringify(snapshot.graph.edges)}`,
    );
  }
  const sourcePort = workflowGraphNodePort(snapshot, edge.sourceNodeId, edge.sourcePortId);
  const targetPort = workflowGraphNodePort(snapshot, edge.targetNodeId, edge.targetPortId);
  await dispatchWorkflowGraphMouseClick(client, surfaceId, {
    x: (sourcePort.screenX + targetPort.screenX) / 2,
    y: (sourcePort.screenY + targetPort.screenY) / 2,
  });
  await waitForWorkflowGraphSnapshot(client, (selectedSnapshot) =>
    selectedSnapshot.interaction.selectedEdgeIds.includes(edgeId),
  );
  await dispatchKeyEvent(client, { code: "Delete", key: "Delete" });
  await dispatchKeyEvent(client, { code: "Delete", key: "Delete", type: "keyUp" });
}

async function openAgentTaskDetailsFromToolbar(client, surfaceId, snapshot) {
  await openWorkflowNodeDetailsFromToolbar(client, surfaceId, snapshot, {
    detailsSelector: '[data-testid="workflow-node-details-agent-task"]',
    nodeId: "agent_task",
    nodeLabel: "Agent Task",
  });
}

async function openWorkflowNodeDetailsFromToolbar(
  client,
  surfaceId,
  snapshot,
  { detailsSelector, nodeId, nodeLabel },
) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`missing ${nodeId} node: ${JSON.stringify(snapshot.graph.nodes)}`);
  }
  await dispatchWorkflowGraphMouseClick(client, surfaceId, {
    x: node.screenX,
    y: node.screenY,
  });
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("workflowNodeDetailsButtonState"),
    (value) => value.disabled === false && value.text.includes(nodeLabel),
  );
  const clickPoint = await client.driver("workflowNodeDetailsButtonRect");
  if (!clickPoint.ok) {
    throw new Error(`workflow details button was not clickable: ${JSON.stringify(clickPoint)}`);
  }
  await dispatchMouseClick(client, clickPoint);
  await waitForState(
    client,
    driverCallExpression("workflowNodeDetailsSurfaceState"),
    (value) => value.exists,
  );
  await waitForSelector(client, detailsSelector);
}

async function waitForWorkflowGraphPaneSettled(client, surfaceId) {
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("workflowGraphPaneSettled", { surfaceId }),
    (value) => value.visible && !value.moving && value.left >= 0 && value.clientWidth > 0,
  );
}

async function waitForTexts(client, texts) {
  await client.installDriver();
  await waitForState(client, driverCallExpression("bodyText"), (value) =>
    texts.every((text) => value.body.includes(text)),
  );
}

async function assertNullWorkflowValid(client, workspaceId) {
  const validation = await client.driver("nullWorkflowValidation", { workspaceId });
  if (!validation.valid || validation.diagnostics.length !== 0) {
    throw new Error(`null workflow validation failed: ${JSON.stringify(validation)}`);
  }
}

async function workflowDefinitions(client, workspaceId) {
  return client.driver("workflowDefinitions", { workspaceId });
}

async function assertContextMenuAnchored(client, point) {
  const position = await client.driver("workflowContextMenuPosition");
  if (!position.ok) {
    throw new Error(`workflow context menu position unavailable: ${JSON.stringify(position)}`);
  }
  const deltaX = Math.abs(position.left - point.x);
  const deltaY = Math.abs(position.top - point.y);
  if (position.position !== "fixed" || deltaX > 2 || deltaY > 2) {
    throw new Error(
      `workflow context menu was not anchored at right-click point: ${JSON.stringify({
        deltaX,
        deltaY,
        menu: position,
        point,
      })}`,
    );
  }
}

async function assertSidebarWorkflowConversationSections(client) {
  const sidebar = await client.driver("sidebarWorkflowRows");
  if (!sidebar.ok) {
    throw new Error(`workflow sidebar sections unavailable: ${JSON.stringify(sidebar)}`);
  }
  const labels = sidebar.rows.map((row) => row.text);
  const workflows = labels.indexOf("Workflows");
  const workflow = labels.indexOf("Untitled workflow");
  const conversations = labels.indexOf("Conversations");
  const noChats = labels.indexOf("No chats");
  if (
    workflows < 0 ||
    workflow < 0 ||
    conversations < 0 ||
    noChats < 0 ||
    !(workflows < workflow && workflow < conversations && conversations < noChats)
  ) {
    throw new Error(
      `workflow sidebar sections are not grouped correctly: ${JSON.stringify(sidebar.rows)}`,
    );
  }
}

function assertRoutePorts(snapshot) {
  const route = snapshot.graph.nodes.find((candidate) => candidate.id === "route");
  if (!route) {
    throw new Error(`route node is missing: ${JSON.stringify(snapshot.graph.nodes)}`);
  }
  const ports = route.ports.map((port) => [port.id, port.label, port.role]);
  const expected = [
    ["input", "", "target"],
    ["route_yes", "yes", "source"],
    ["route_no", "no", "source"],
    ["route_default", "default", "source"],
  ];
  if (JSON.stringify(ports) !== JSON.stringify(expected)) {
    throw new Error(`route ports = ${JSON.stringify(ports)}, want ${JSON.stringify(expected)}`);
  }
}

function assertWorkflowNodeDiagnostic(snapshot, nodeId, code) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node?.diagnostic?.codes?.includes(code)) {
    throw new Error(
      `missing workflow node diagnostic ${nodeId}/${code}: ${JSON.stringify(snapshot.graph.nodes)}`,
    );
  }
}

function assertWorkflowEdgeDiagnostic(snapshot, edgeId, code) {
  const edge = snapshot.graph.edges.find((candidate) => candidate.id === edgeId);
  if (!edge?.diagnostic?.codes?.includes(code)) {
    throw new Error(
      `missing workflow edge diagnostic ${edgeId}/${code}: ${JSON.stringify(snapshot.graph.edges)}`,
    );
  }
}

function assertDraftWorkflowProjection(snapshot, expectedDefinitionName) {
  const actual = draftWorkflowProjectionMetadata(snapshot);
  const expected = {
    definitionName: expectedDefinitionName,
    definitionVersionId: "",
    definitionVersionNumber: 0,
    editable: true,
    executionId: "",
    executionStatus: "",
    versionMismatch: false,
    viewMode: "draft",
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`draft workflow projection mismatch: ${JSON.stringify(actual)}`);
  }
}

function assertRunWorkflowProjection(snapshot, execution) {
  const actual = runWorkflowProjectionMetadata(snapshot);
  const expected = {
    definitionId: execution.definitionId,
    definitionVersionId: execution.definitionVersionId,
    hasDefinitionVersionNumber: true,
    editable: false,
    executionId: execution.id,
    versionMismatch: false,
    viewMode: "run",
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `run workflow projection mismatch: execution=${JSON.stringify(execution)} workflow=${JSON.stringify(actual)}`,
    );
  }
}

function draftWorkflowProjectionMetadata(snapshot) {
  const workflow = snapshot.graph.workflow;
  if (!workflow) {
    return null;
  }
  return {
    definitionName: workflow.definitionName,
    definitionVersionId: workflow.definitionVersionId,
    definitionVersionNumber: workflow.definitionVersionNumber,
    editable: workflow.editable,
    executionId: workflow.executionId,
    executionStatus: workflow.executionStatus,
    versionMismatch: workflow.versionMismatch,
    viewMode: workflow.viewMode,
  };
}

function runWorkflowProjectionMetadata(snapshot) {
  const workflow = snapshot.graph.workflow;
  if (!workflow) {
    return null;
  }
  return {
    definitionId: workflow.definitionId,
    definitionVersionId: workflow.definitionVersionId,
    hasDefinitionVersionNumber: workflow.definitionVersionNumber > 0,
    editable: workflow.editable,
    executionId: workflow.executionId,
    versionMismatch: workflow.versionMismatch,
    viewMode: workflow.viewMode,
  };
}

function offsetFromWorkflowGraphNode(snapshot, nodeId, offset) {
  const node = workflowGraphNode(snapshot, nodeId);
  const margin = 80;
  const maxX = Math.max(margin, snapshot.canvas.clientWidth - margin);
  const maxY = Math.max(margin, snapshot.canvas.clientHeight - margin);
  return {
    x: clamp(Math.round(node.screenX + offset.x), margin, maxX),
    y: clamp(Math.round(node.screenY + offset.y), margin, maxY),
  };
}

async function moveWorkflowGraphNode(client, surfaceId, snapshot, nodeId, delta) {
  const node = workflowGraphNode(snapshot, nodeId);
  const expected = {
    x: Math.round(node.x + delta.x),
    y: Math.round(node.y + delta.y),
  };
  await dispatchWorkflowGraphMouseDrag(client, surfaceId, {
    from: { x: node.screenX, y: node.screenY },
    to: { x: node.screenX + delta.x, y: node.screenY + delta.y },
  });
  return waitForWorkflowGraphSnapshot(client, (nextSnapshot) =>
    workflowGraphNodePositionMatches(nextSnapshot, nodeId, expected),
  );
}

function workflowGraphNodeWorldPosition(snapshot, nodeId) {
  const node = workflowGraphNode(snapshot, nodeId);
  return {
    x: Math.round(node.x),
    y: Math.round(node.y),
  };
}

function workflowGraphNodePositionMatches(snapshot, nodeId, expected) {
  const node = workflowGraphNode(snapshot, nodeId);
  return (
    Math.abs(Math.round(node.x) - expected.x) <= 1 && Math.abs(Math.round(node.y) - expected.y) <= 1
  );
}

function assertWorkflowGraphNodePosition(snapshot, nodeId, expected, phase) {
  if (!workflowGraphNodePositionMatches(snapshot, nodeId, expected)) {
    throw new Error(
      `workflow node ${nodeId} position changed ${phase}: expected=${JSON.stringify(
        expected,
      )} actual=${JSON.stringify(workflowGraphNodeWorldPosition(snapshot, nodeId))}`,
    );
  }
}

function workflowGraphNode(snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(
      `missing workflow graph node ${nodeId}: ${JSON.stringify(snapshot.graph.nodes)}`,
    );
  }
  return node;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function configureWorkflowResultAction(client, surfaceId, workspaceId, definitionId) {
  const graphSnapshot = await waitForWorkflowGraphSnapshot(client, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === "agent_task"),
  );
  await openAgentTaskDetailsFromToolbar(client, surfaceId, graphSnapshot);
  await restoreMaximizedWorkflowGraphPane(client);
  await waitForSelector(
    client,
    `${visibleWorkflowNodeDetailsSurfaceSelector} [data-testid="workflow-node-prompt"]`,
  );
  await setWorkflowNodeDetailsControlValue(
    client,
    '[data-testid="workflow-node-prompt"]',
    workflowResultPrompt,
  );
  await clickWorkflowNodeDetailsSaveButton(client);
  const definition = await waitForWorkflowDefinition(
    client,
    workspaceId,
    definitionId,
    (candidate) => {
      const agentTask = candidate.graph.nodes.find((node) => node.id === "agent_task");
      return agentTask?.action?.codex?.prompt === workflowResultPrompt;
    },
  );
  await waitForWorkflowGraphSnapshot(
    client,
    (snapshot) => snapshot.graph.workflow?.draftRevision === definition.draftRevision,
  );
  return definition;
}

function assertSavedTypedRouteDefinition(definition) {
  assertRouteYesCondition(requireSavedWorkflowEdge(definition, "route_end"));
  assertRouteDefaultCondition(requireSavedWorkflowEdge(definition, "route_end_2"));
}

function requireSavedWorkflowEdge(definition, edgeId) {
  const edge = definition.graph.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) {
    throw new Error(
      `missing saved workflow edge ${edgeId}: ${JSON.stringify(definition.graph.edges)}`,
    );
  }
  return edge;
}

function assertRouteYesCondition(edge) {
  const condition = requireEdgeCondition(edge, "action_signal");
  assertConditionField(edge, condition, "nodeId", "agent_task");
  assertConditionField(edge, condition, "signalName", "route");
  assertConditionField(edge, condition, "signalValue", "yes");
}

function assertRouteDefaultCondition(edge) {
  requireEdgeCondition(edge, "default");
}

function requireEdgeCondition(edge, kind) {
  if (edge.condition?.kind !== kind) {
    throw new Error(`edge ${edge.id} condition mismatch: ${JSON.stringify(edge)}`);
  }
  return edge.condition;
}

function assertConditionField(edge, condition, field, expected) {
  if (condition[field] !== expected) {
    throw new Error(`edge ${edge.id} condition mismatch: ${JSON.stringify(edge)}`);
  }
}

async function startWorkflowAndWaitForCompletion(client, workspaceId, definitionId) {
  const runStarted = await client.driver("runWorkflowDraftForSurface", {
    definitionId,
    surfaceId: workflowGraphSurfaceId,
  });
  if (!runStarted.ok) {
    throw new Error(`workflow run was not started: ${JSON.stringify(runStarted)}`);
  }
  workflowGraphSurfaceId = runStarted.surfaceId;
  const runProjection = await waitForWorkflowGraphSnapshot(
    client,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.executionId,
  );
  const executionId = runProjection.graph.workflow.executionId;
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("readWorkflowExecution", { executionId, workspaceId }),
    (execution) => ["completed", "failed", "cancelled", "stopped"].includes(execution.status),
  ).then((execution) => {
    if (execution.status !== "completed") {
      throw new Error(`workflow execution did not complete: ${JSON.stringify(execution)}`);
    }
    return execution;
  });
}

function assertTypedRouteExecution(execution) {
  const completedEdges = execution.tokens
    .filter((token) => token.status === "completed")
    .map((token) => token.edgeId);
  if (!completedEdges.includes("route_end")) {
    throw new Error(`typed route edge was not completed: ${JSON.stringify(execution.tokens)}`);
  }
  if (completedEdges.includes("route_end_2")) {
    throw new Error(
      `default route edge unexpectedly completed: ${JSON.stringify(execution.tokens)}`,
    );
  }
  const endExecution = execution.nodeExecutions.find((node) => node.nodeId === "end");
  const defaultEndExecution = execution.nodeExecutions.find((node) => node.nodeId === "end_2");
  if (endExecution?.status !== "succeeded" || defaultEndExecution) {
    throw new Error(
      `typed route node executions mismatch: ${JSON.stringify(execution.nodeExecutions)}`,
    );
  }
}

function cameraChanged(actual, initial) {
  return (
    Math.abs(actual.x - initial.x) > 20 ||
    Math.abs(actual.y - initial.y) > 20 ||
    Math.abs(actual.zoom - initial.zoom) > 0.01
  );
}

function assertCameraPreserved(actual, expected) {
  const delta = {
    x: Math.abs(actual.x - expected.x),
    y: Math.abs(actual.y - expected.y),
    zoom: Math.abs(actual.zoom - expected.zoom),
  };
  if (delta.x > 0.5 || delta.y > 0.5 || delta.zoom > 0.001) {
    throw new Error(
      `workflow camera changed after node creation: ${JSON.stringify({
        actual,
        delta,
        expected,
      })}`,
    );
  }
}

async function connectWorkflowGraphNodes(
  client,
  surfaceId,
  snapshot,
  { sourceNodeId, sourcePortId = "output", targetNodeId, targetPortId = "input" },
) {
  const sourcePort = workflowGraphNodePort(snapshot, sourceNodeId, sourcePortId);
  const targetPort = workflowGraphNodePort(snapshot, targetNodeId, targetPortId);
  await dispatchWorkflowGraphMouseDrag(client, surfaceId, {
    from: { x: sourcePort.screenX, y: sourcePort.screenY },
    to: { x: targetPort.screenX, y: targetPort.screenY },
  });
}

function workflowGraphNodePort(snapshot, nodeId, portId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(
      `missing workflow graph node ${nodeId}: ${JSON.stringify(snapshot.graph.nodes)}`,
    );
  }
  const port = node.ports.find((candidate) => candidate.id === portId);
  if (!port) {
    throw new Error(
      `missing workflow graph port ${nodeId}:${portId}: ${JSON.stringify(node.ports)}`,
    );
  }
  return port;
}

async function readSavedWorkflowDefinition(workspaceRoot, definitionId) {
  const workflowDir = join(workspaceRoot, ".setta", "workflows");
  const entries = await readdir(workflowDir);
  const matches = entries.filter((entry) => entry.endsWith(`--${definitionId}.json`));
  if (matches.length !== 1) {
    throw new Error(
      `expected one saved workflow definition file, found ${JSON.stringify(entries)}`,
    );
  }
  return JSON.parse(await readFile(join(workflowDir, matches[0]), "utf8"));
}

async function waitForWorkflowGraphSnapshot(client, predicate, { includeVisual = false } = {}) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      includeVisual,
      surfaceId: workflowGraphSurfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
  ).then((value) => value.snapshot);
}
