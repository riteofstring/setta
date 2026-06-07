/* global console */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  createElectronFixture,
  dispatchKeyEvent,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  dispatchPixiContextMenu,
  dispatchPixiMouseClick,
  dispatchPixiMouseDrag,
  maximizePixiWorkspacePane,
  openPixiWorkspacePane,
} from "./pixi-workspace-niri-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));

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
let pixiSurfaceId = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_PIXI_WORKSPACE_DEBUG: "1",
    },
    fixture,
    visible: options.visible,
  });

  await waitForSelector(context.client, '[data-testid="niri-workspace-area"]');
  const workspaceId = await openWorkspace(context.client);
  await assertNullWorkflowValid(context.client, workspaceId);
  await openPixiWorkspacePane(context.client);
  await waitForSelector(context.client, '[data-testid="pixi-workspace"]');
  pixiSurfaceId = await maximizePixiWorkspacePane(context.client);
  const blankCanvas = await waitForPixiSnapshot(
    context.client,
    (snapshot) => snapshot.graph.nodeCount === 0,
  );
  await dispatchPixiMouseDrag(context.client, pixiSurfaceId, {
    from: { x: 420, y: 320 },
    to: { x: 500, y: 380 },
  });
  const pannedCanvas = await waitForPixiSnapshot(
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
  const bodyText = await context.client.evaluate("document.body.innerText");
  if (bodyText.includes("Create workflow")) {
    throw new Error(`blank workflow canvas exposed a create button: ${bodyText}`);
  }
  await waitForToolbarState(context.client, "Blank draft");

  await selectToolbarWorkflowNodeType(context.client, "start");
  await delay(150);
  const afterAdd = await waitForPixiSnapshot(
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
  assertCameraPreserved(afterAdd.camera, pannedCanvas.camera);
  await clickWorkflowRunButton(context.client);
  const invalidStart = await waitForPixiSnapshot(
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

  const secondNodeMenuPoint = await dispatchPixiContextMenu(context.client, pixiSurfaceId, {
    x: 600,
    y: 260,
  });
  await waitForSelector(context.client, '[data-testid="workflow-node-create-menu"]');
  await assertContextMenuAnchored(context.client, secondNodeMenuPoint);
  await selectWorkflowNodeType(context.client, "agent_task");
  await delay(150);
  const afterSecondNode = await waitForPixiSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 2 &&
      snapshot.graph.nodes.some((node) => node.id === "agent_task") &&
      snapshot.graph.nodes.every((node) => node.diagnostic === null),
  );
  await openAgentTaskDetailsFromToolbar(context.client, pixiSurfaceId, afterSecondNode);
  await focusPixiWorkspacePane(context.client);
  pixiSurfaceId = await maximizePixiWorkspacePane(context.client);
  await waitForPixiWorkspacePaneSettled(context.client, pixiSurfaceId);
  const afterDetails = await waitForPixiSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 2 &&
      snapshot.graph.nodes.some((node) => node.id === "agent_task") &&
      snapshot.canvas.clientWidth >= afterSecondNode.canvas.clientWidth &&
      snapshot.canvas.left >= 0,
  );
  await connectPixiNodes(context.client, pixiSurfaceId, afterDetails, {
    sourceNodeId: "start",
    targetNodeId: "agent_task",
  });
  const afterEdge = await waitForPixiSnapshot(
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

  await addWorkflowNodeAt(context.client, pixiSurfaceId, "route", { x: 820, y: 260 });
  const routeOnly = await waitForPixiSnapshot(context.client, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === "route"),
  );
  const firstEndPoint = offsetFromPixiNode(routeOnly, "route", { x: 220, y: -140 });
  const secondEndPoint = offsetFromPixiNode(routeOnly, "route", { x: 220, y: 140 });
  await addWorkflowNodeAt(context.client, pixiSurfaceId, "end", firstEndPoint);
  await waitForPixiSnapshot(context.client, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === "end"),
  );
  await addWorkflowNodeAt(context.client, pixiSurfaceId, "end", secondEndPoint);
  const routeNodes = await waitForPixiSnapshot(
    context.client,
    (snapshot) =>
      snapshot.graph.nodeCount === 5 &&
      snapshot.graph.nodes.some((node) => node.id === "route") &&
      snapshot.graph.nodes.some((node) => node.id === "end_2"),
  );
  assertRoutePorts(routeNodes);
  await connectPixiNodes(context.client, pixiSurfaceId, routeNodes, {
    sourceNodeId: "route",
    sourcePortId: "route_yes",
    targetNodeId: "end",
  });
  await waitForPixiSnapshot(context.client, (snapshot) =>
    snapshot.graph.edges.some(
      (edge) =>
        edge.id === "route_end" &&
        edge.label === "route=yes" &&
        edge.sourcePortId === "route_yes" &&
        edge.targetNodeId === "end",
    ),
  );
  await clickWorkflowValidateButton(context.client);
  const diagnosedYesRoute = await waitForPixiSnapshot(context.client, (snapshot) =>
    snapshot.graph.edges.some(
      (edge) =>
        edge.id === "route_end" &&
        edge.diagnostic?.severity === "error" &&
        edge.diagnostic?.codes?.includes("edge_condition_invalid"),
    ),
  );
  assertWorkflowEdgeDiagnostic(diagnosedYesRoute, "route_end", "edge_condition_invalid");
  await connectPixiNodes(context.client, pixiSurfaceId, diagnosedYesRoute, {
    sourceNodeId: "agent_task",
    targetNodeId: "route",
  });
  const routeInput = await waitForPixiSnapshot(context.client, (snapshot) =>
    snapshot.graph.edges.some(
      (edge) =>
        edge.id === "agent_task_route" &&
        edge.sourceNodeId === "agent_task" &&
        edge.targetNodeId === "route",
    ),
  );
  await connectPixiNodes(context.client, pixiSurfaceId, routeInput, {
    sourceNodeId: "route",
    sourcePortId: "route_default",
    targetNodeId: "end_2",
  });
  const typedRoute = await waitForPixiSnapshot(context.client, (snapshot) =>
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
  const state = await waitForState(
    client,
    `(async () => {
      const session = await window.setta.workspace.session();
      return {
        body: document.body.innerText,
        activeWorkspaceCount: session.activeWorkspaces.length,
        selectedWorkspaceId: session.selectedWorkspaceId,
      };
    })()`,
    (value) =>
      value.activeWorkspaceCount === 1 &&
      value.selectedWorkspaceId !== "" &&
      value.body.includes("workspace-root"),
  );
  return state.selectedWorkspaceId;
}

async function clickButtonByAria(client, label) {
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector(
        \`button[aria-label=${JSON.stringify(label)}]\`
      );
      return { ready: Boolean(button && !button.disabled) };
    })()`,
    (value) => value.ready,
  );
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector(
      \`button[aria-label=${JSON.stringify(label)}]\`
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`button was not clickable: ${label}`);
  }
}

async function selectWorkflowNodeType(client, nodeType) {
  const selected = await client.evaluate(`(() => {
    const button = document.querySelector(
      ${JSON.stringify(`[data-testid="workflow-node-create-${nodeType}"]`)}
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-node-menu-item" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!selected.ok) {
    throw new Error(
      `failed to select ${nodeType} node from workflow context menu: ${JSON.stringify(selected)}`,
    );
  }
}

async function selectToolbarWorkflowNodeType(client, nodeType) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="workflow-add-node-button"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "missing-or-disabled-add-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!opened.ok) {
    throw new Error(`failed to open toolbar add menu: ${JSON.stringify(opened)}`);
  }
  await waitForSelector(client, '[data-testid="workflow-toolbar-add-menu"]');
  const selected = await client.evaluate(`((nodeType) => {
    const button = document.querySelector(
      \`[data-testid="workflow-toolbar-add-\${nodeType}"]\`
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-toolbar-node-menu-item" };
    }
    button.click();
    return { ok: true };
  })(${JSON.stringify(nodeType)})`);
  if (!selected.ok) {
    throw new Error(
      `failed to select ${nodeType} node from workflow toolbar: ${JSON.stringify(selected)}`,
    );
  }
}

async function waitForToolbarState(client, expected) {
  await waitForState(
    client,
    `(() => {
      const state = document.querySelector('[data-testid="workflow-toolbar-state"]');
      return { text: state?.textContent?.trim() ?? "" };
    })()`,
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
  const clicked = await client.evaluate(`((testId) => {
    const button = document.querySelector(\`[data-testid="\${testId}"]\`);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "button-unavailable" };
    }
    button.click();
    return { ok: true };
  })(${JSON.stringify(testId)})`);
  if (!clicked.ok) {
    throw new Error(`workflow toolbar button was not clickable: ${JSON.stringify(clicked)}`);
  }
}

async function addWorkflowNodeAt(client, surfaceId, nodeType, point) {
  const menuPoint = await dispatchPixiContextMenu(client, surfaceId, point);
  await waitForSelector(client, '[data-testid="workflow-node-create-menu"]');
  await assertContextMenuAnchored(client, menuPoint);
  await selectWorkflowNodeType(client, nodeType);
  await delay(150);
}

async function openAgentTaskDetailsFromToolbar(client, surfaceId, snapshot) {
  const agentTask = snapshot.graph.nodes.find((node) => node.id === "agent_task");
  if (!agentTask) {
    throw new Error(`missing agent_task node: ${JSON.stringify(snapshot.graph.nodes)}`);
  }
  await dispatchPixiMouseClick(client, surfaceId, {
    x: agentTask.screenX,
    y: agentTask.screenY,
  });
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector('[data-testid="workflow-node-details-button"]');
      return {
        disabled: button instanceof HTMLButtonElement ? button.disabled : true,
        text: button?.textContent?.trim() ?? "",
      };
    })()`,
    (value) => value.disabled === false && value.text.includes("Agent Task"),
  );
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="workflow-node-details-button"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "details-button-unavailable" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`workflow details button was not clickable: ${JSON.stringify(clicked)}`);
  }
  await waitForSelector(client, '[data-testid="workflow-node-details-surface"]');
  await waitForSelector(client, '[data-testid="workflow-node-details-agent-task"]');
}

async function focusPixiWorkspacePane(client) {
  await dispatchKeyEvent(client, { code: "ArrowLeft", key: "ArrowLeft" });
  await dispatchKeyEvent(client, { code: "ArrowLeft", key: "ArrowLeft", type: "keyUp" });
  await waitForState(
    client,
    `(() => {
      const host = document.querySelector(
        '[data-testid="niri-fake-pane-host"][data-surface-kind="pixi-canvas"]'
      );
      return {
        focused: host instanceof HTMLElement ? host.dataset.focused === "true" : false,
      };
    })()`,
    (value) => value.focused,
  );
}

async function waitForPixiWorkspacePaneSettled(client, surfaceId) {
  await waitForState(
    client,
    `((surfaceId) => {
      const root = [...document.querySelectorAll('[data-testid="pixi-workspace"]')]
        .find((candidate) => candidate.dataset.surfaceId === surfaceId);
      const host = root?.closest('[data-testid="niri-fake-pane-host"]');
      const canvas = root?.querySelector('[data-testid="pixi-workspace-canvas"]');
      const rect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
      return {
        clientWidth: canvas instanceof HTMLCanvasElement ? canvas.clientWidth : 0,
        left: rect?.left ?? Number.NEGATIVE_INFINITY,
        moving: host instanceof HTMLElement ? host.dataset.moving === "true" : true,
        visible: host instanceof HTMLElement ? host.dataset.visible === "true" : false,
      };
    })(${JSON.stringify(surfaceId)})`,
    (value) => value.visible && !value.moving && value.left >= 0 && value.clientWidth > 0,
  );
}

async function waitForTexts(client, texts) {
  await waitForState(client, `(() => ({ body: document.body.innerText }))()`, (value) =>
    texts.every((text) => value.body.includes(text)),
  );
}

async function assertNullWorkflowValid(client, workspaceId) {
  const validation = await client.evaluate(
    `(async (workspaceId) => {
      return window.setta.workflow.validateDefinition(workspaceId, {
        edges: [],
        layout: { nodes: [] },
        nodes: [],
      });
    })(${JSON.stringify(workspaceId)})`,
  );
  if (!validation.valid || validation.diagnostics.length !== 0) {
    throw new Error(`null workflow validation failed: ${JSON.stringify(validation)}`);
  }
}

async function workflowDefinitions(client, workspaceId) {
  return client.evaluate(
    `(async (workspaceId) => {
      const response = await window.setta.workflow.listDefinitions(workspaceId);
      return response.definitions.map((definition) => ({
        id: definition.id,
        name: definition.name,
      }));
    })(${JSON.stringify(workspaceId)})`,
  );
}

async function assertContextMenuAnchored(client, point) {
  const position = await client.evaluate(`(() => {
    const menu = document.querySelector('[data-testid="workflow-node-create-menu"]');
    if (!(menu instanceof HTMLElement)) {
      return { ok: false, reason: "missing-menu" };
    }
    const rect = menu.getBoundingClientRect();
    return {
      left: rect.left,
      ok: true,
      position: getComputedStyle(menu).position,
      top: rect.top,
    };
  })()`);
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
  const sidebar = await client.evaluate(`(() => {
    const list = document.querySelector('[data-testid="sidebar-navigation-list"]');
    if (!(list instanceof HTMLElement)) {
      return { ok: false, reason: "missing-sidebar-list" };
    }
    const rows = [...list.querySelectorAll('[data-item-index]')].map((row) => ({
      section: row.querySelector('[data-sidebar-section]')?.getAttribute('data-sidebar-section') ?? "",
      testId: row.getAttribute("data-testid") ?? "",
      text: row.textContent?.trim().replace(/\\s+/g, " ") ?? "",
    }));
    return { ok: true, rows };
  })()`);
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

function offsetFromPixiNode(snapshot, nodeId, offset) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`missing Pixi node ${nodeId}: ${JSON.stringify(snapshot.graph.nodes)}`);
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
  return client.evaluate(
    `(async (workspaceId, definitionId) => {
      const definition = await window.setta.workflow.readDefinition(workspaceId, definitionId);
      const graph = {
        ...definition.graph,
        nodes: definition.graph.nodes.map((node) => {
          if (node.id !== "agent_task") {
            return node;
          }
          return {
            ...node,
            action: {
              ...node.action,
              codex: {
                ...node.action.codex,
                prompt: "workflow result action",
              },
            },
          };
        }),
      };
      return window.setta.workflow.updateDefinition(
        workspaceId,
        definitionId,
        definition.name,
        definition.description,
        graph,
      );
    })(${JSON.stringify(workspaceId)}, ${JSON.stringify(definitionId)})`,
  );
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
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="workflow-run-button"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "run-button-unavailable" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`workflow run button was not clickable: ${JSON.stringify(clicked)}`);
  }
  const runProjection = await waitForPixiSnapshot(
    client,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.executionId,
  );
  const executionId = runProjection.graph.workflow.executionId;
  await waitForToolbarState(client, "Run completed");
  return waitForState(
    client,
    `(async (workspaceId, executionId) => {
      return window.setta.workflow.readExecution(workspaceId, executionId);
    })(${JSON.stringify(workspaceId)}, ${JSON.stringify(executionId)})`,
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

async function connectPixiNodes(
  client,
  surfaceId,
  snapshot,
  { sourceNodeId, sourcePortId = "output", targetNodeId, targetPortId = "input" },
) {
  const sourcePort = pixiNodePort(snapshot, sourceNodeId, sourcePortId);
  const targetPort = pixiNodePort(snapshot, targetNodeId, targetPortId);
  await dispatchPixiMouseDrag(client, surfaceId, {
    from: { x: sourcePort.screenX, y: sourcePort.screenY },
    to: { x: targetPort.screenX, y: targetPort.screenY },
  });
}

function pixiNodePort(snapshot, nodeId, portId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`missing Pixi node ${nodeId}: ${JSON.stringify(snapshot.graph.nodes)}`);
  }
  const port = node.ports.find((candidate) => candidate.id === portId);
  if (!port) {
    throw new Error(`missing Pixi port ${nodeId}:${portId}: ${JSON.stringify(node.ports)}`);
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

async function waitForPixiSnapshot(client, predicate) {
  const surfaceId = JSON.stringify(pixiSurfaceId);
  return waitForState(
    client,
    `(() => {
      const api = window.__settaPixiWorkspaceDebug;
      if (!api) {
        return { ready: false };
      }
      const snapshot = api.getSnapshot(${surfaceId});
      return { ready: true, snapshot };
    })()`,
    (value) => value.ready && predicate(value.snapshot),
  ).then((value) => value.snapshot);
}
