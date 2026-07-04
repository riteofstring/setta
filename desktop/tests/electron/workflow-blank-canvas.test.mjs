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

  const definitions = await workflowDefinitions(context.client, workspaceId);
  if (definitions.length !== 1 || definitions[0].name !== "Untitled workflow") {
    throw new Error(`workflow definitions after first edit = ${JSON.stringify(definitions)}`);
  }
  await assertSidebarWorkflowConversationSections(context.client);
  const saved = await readSavedWorkflowDefinition(fixture.workspaceRoot, definitions[0].id);
  if (
    saved.name !== "Untitled workflow" ||
    saved.graph.nodes[0]?.kind !== "start" ||
    saved.graph.nodes[1]?.kind !== "action"
  ) {
    throw new Error(`saved workflow definition mismatch: ${JSON.stringify(saved)}`);
  }
  if (saved.graph.layout.nodes[0]?.nodeId !== "start") {
    throw new Error(
      `saved workflow layout missing start node: ${JSON.stringify(saved.graph.layout)}`,
    );
  }
  if (
    saved.graph.edges.length !== 1 ||
    saved.graph.edges[0]?.id !== "start_agent_task" ||
    saved.graph.edges[0]?.fromNodeId !== "start" ||
    saved.graph.edges[0]?.toNodeId !== "agent_task" ||
    saved.graph.edges[0]?.kind !== "normal" ||
    saved.graph.edges[0]?.condition !== null
  ) {
    throw new Error(`saved workflow edge mismatch: ${JSON.stringify(saved.graph.edges)}`);
  }

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
      !snapshot.graph.nodes.some((node) => node.id === "merge") && snapshot.graph.nodeCount === 2,
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
  const firstEndPoint = offsetFromWorkflowGraphNode(routeOnly, "route", { x: 220, y: -140 });
  const secondEndPoint = offsetFromWorkflowGraphNode(routeOnly, "route", { x: 220, y: 140 });
  await addWorkflowNodeAt(context.client, workflowGraphSurfaceId, "end", firstEndPoint);
  await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === "end"),
  );
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
  await clickWorkflowValidateButton(context.client);
  const diagnosedYesRoute = await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    snapshot.graph.edges.some(
      (edge) =>
        edge.id === "route_end" &&
        edge.diagnostic?.severity === "error" &&
        edge.diagnostic?.codes?.includes("edge_condition_invalid"),
    ),
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
    workspaceId,
    definitions[0].id,
  );
  assertSavedTypedRouteDefinition(routeDefinition);
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
  await openWorkflowNodeDetailsFromToolbar(
    context.client,
    workflowGraphSurfaceId,
    completedRunGraph,
    {
      detailsSelector: '[data-testid="workflow-node-run-details"]',
      nodeId: "agent_task",
      nodeLabel: "Agent Task",
    },
  );
  await assertWorkflowRunDetails(context.client);

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
    driverCallExpression("workflowToolbarState"),
    (value) => value.text === expected,
  );
}

async function clickWorkflowRunButton(client) {
  await clickWorkflowToolbarButton(client, "workflow-run-button");
}

async function clickWorkflowValidateButton(client) {
  await clickWorkflowToolbarButton(client, "workflow-validate-button");
}

async function clickWorkflowToolbarButton(client, testId) {
  const clicked = await client.driver("clickWorkflowToolbarButton", { testId });
  if (!clicked.ok) {
    throw new Error(`workflow toolbar button was not clickable: ${JSON.stringify(clicked)}`);
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
  return client.driver("renameWorkflowDefinitionFromCurrentGraph", {
    definitionId,
    description,
    name,
    workspaceId,
  });
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

async function assertWorkflowRunDetails(client) {
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("workflowRunDetailsState"),
    workflowRunDetailsReady,
  );
}

function workflowRunDetailsReady(state) {
  const requiredText = [
    "Run status",
    "succeeded",
    "route=yes",
    "decision=exit",
    "scripted workflow result",
    "reports/workflow-result.md",
    "Agent Trajectory",
  ];
  return [
    state.workflowTrajectorySurfaceCount === 1,
    state.chatConversationTrajectoryCount === 0,
    workflowRunDetailsHasActivity(state),
    requiredText.every((text) => state.text.includes(text)),
  ].every(Boolean);
}

function workflowRunDetailsHasActivity(state) {
  return state.activityGroupHeaderCount >= 1 || state.runActivityRowCount >= 1;
}

async function waitForWorkflowGraphPaneSettled(client, surfaceId) {
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("workflowGraphPaneSettled", { surfaceId }),
    (value) =>
      value.visible &&
      !value.moving &&
      value.left >= 0 &&
      value.clientWidth > 0 &&
      value.clientHeight > 0 &&
      value.width > 0 &&
      value.height > 0,
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
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(
      `missing workflow graph node ${nodeId}: ${JSON.stringify(snapshot.graph.nodes)}`,
    );
  }
  const margin = 80;
  const maxX = Math.max(margin, snapshot.canvas.clientWidth - margin);
  const maxY = Math.max(margin, snapshot.canvas.clientHeight - margin);
  return {
    x: clamp(Math.round(node.screenX + offset.x), margin, maxX),
    y: clamp(Math.round(node.screenY + offset.y), margin, maxY),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function configureWorkflowResultAction(client, workspaceId, definitionId) {
  return client.driver("configureWorkflowResultAction", { definitionId, workspaceId });
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
  await clickWorkflowToolbarButton(client, "workflow-run-button");
  const runProjection = await waitForWorkflowGraphSnapshot(
    client,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.executionId,
  );
  const executionId = runProjection.graph.workflow.executionId;
  await waitForToolbarState(client, "Run completed read-only");
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

async function waitForWorkflowGraphSnapshot(client, predicate) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      includeVisual: false,
      surfaceId: workflowGraphSurfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
  ).then((value) => value.snapshot);
}
