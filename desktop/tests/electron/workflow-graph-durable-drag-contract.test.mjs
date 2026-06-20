/* global console */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
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
import {
  dispatchWorkflowGraphMouseDrag,
  dispatchWorkflowGraphMouseMove,
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
  pagePointForCanvasPoint,
} from "./workflow-graph-layout-helpers.mjs";
import {
  createWorkflowProjectionFixture,
  isWorkflowProjectionSnapshotReady,
} from "./workflow-projection-smoke-helpers.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractDriverPath = join(scriptDir, "workflow-graph-contract-browser-driver.js");
const contractDriverVersion = "setta-workflow-graph-contract-driver-v1";
const scenarioHandlers = {
  "active-replacement-during-drag": activeReplacementDuringDragScenario,
  "editable-draft-durability": editableDraftDurabilityScenario,
  "read-only-run-ports": readOnlyRunPortsScenario,
  "read-only-run-view-layout": readOnlyRunViewLayoutScenario,
};
const options = parseContractArgs(process.argv.slice(2));

if (options.help) {
  printUsage();
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const scenarioNames =
  options.scenario === "all" ? Object.keys(scenarioHandlers) : [options.scenario];
for (const scenarioName of scenarioNames) {
  if (!scenarioHandlers[scenarioName]) {
    throw new Error(`unknown workflow graph contract scenario: ${scenarioName}`);
  }
}

const artifactDir =
  options.artifactDir || timestampedRecordingDir(`workflow-graph-contract-${options.scenario}`);
await writeLatestRecordingPointer("workflow-graph-contract", artifactDir);

const summary = [];
for (const scenarioName of scenarioNames) {
  const scenarioArtifactDir = join(artifactDir, scenarioName);
  try {
    await scenarioHandlers[scenarioName](scenarioArtifactDir);
    summary.push({ scenario: scenarioName, status: "passed" });
  } catch (error) {
    summary.push({
      error: error instanceof Error ? error.message : String(error),
      scenario: scenarioName,
      status: "failed",
    });
    await writeJson(join(artifactDir, "summary.json"), { artifactDir, scenarios: summary });
    throw error;
  }
}

await writeJson(join(artifactDir, "summary.json"), { artifactDir, scenarios: summary });
console.log(`workflow graph durable drag contract passed: ${artifactDir}`);

async function editableDraftDurabilityScenario(scenarioArtifactDir) {
  const fixture = await createElectronFixture("workflow-graph-editable-drag-contract");
  let context = await launchContractContext(fixture, join(scenarioArtifactDir, "initial"));
  try {
    const setup = await createAndOpenDraftWorkflow(context, fixture);
    await installContractDriver(context.client);

    const before = setup.snapshot;
    const afterDrag = await dragNodeAndWaitForMove(
      context.client,
      setup.surfaceId,
      before,
      "work",
      {
        x: 96,
        y: 52,
      },
    );
    assertOnlyNodeMoved(before, afterDrag, "work", "editable draft drag");

    const persisted = await waitForDraftProjectionLayout(
      context.client,
      setup.projection.workspaceId,
      setup.projection.definitionId,
      afterDrag,
      "work",
    );

    await stopElectronCdpContext(context);
    context = await launchContractContext(fixture, join(scenarioArtifactDir, "relaunch"));
    const reopened = await openDraftWorkflowGraph(context.client, fixture, {
      ...setup.projection,
      layout: persisted.projection.layout,
    });
    assertBackendLayoutMatchesSnapshot(persisted.projection, reopened.snapshot, "work");

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      afterDrag,
      persisted: persisted.projection,
      reopened: reopened.snapshot,
      scenario: "editable-draft-durability",
      status: "passed",
    });
  } catch (error) {
    await captureContractFailure(context, scenarioArtifactDir);
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function readOnlyRunPortsScenario(scenarioArtifactDir) {
  const fixture = await createElectronFixture("workflow-graph-read-only-ports-contract");
  let context = null;
  try {
    context = await launchContractContext(fixture, scenarioArtifactDir);
    const setup = await createAndOpenDraftWorkflow(context, fixture);
    await installContractDriver(context.client);
    const run = await openRunProjection(context.client, setup.surfaceId, setup.projection);

    const issues = [];
    const portCount = interactivePortCount(run.snapshot);
    if (portCount !== 0) {
      issues.push(`read-only run projection exposed ${portCount} interactive workflow ports`);
      await exerciseReadOnlyPortAffordance(context.client, run.surfaceId, run.snapshot, issues);
    }
    if (issues.length > 0) {
      throw new Error(issues.join("\n"));
    }

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      run: run.snapshot,
      scenario: "read-only-run-ports",
      status: "passed",
    });
  } catch (error) {
    await captureContractFailure(context, scenarioArtifactDir);
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function readOnlyRunViewLayoutScenario(scenarioArtifactDir) {
  const fixture = await createElectronFixture("workflow-graph-read-only-layout-contract");
  let context = null;
  try {
    context = await launchContractContext(fixture, scenarioArtifactDir);
    const setup = await createAndOpenDraftWorkflow(context, fixture);
    await installContractDriver(context.client);
    const run = await openRunProjection(context.client, setup.surfaceId, setup.projection);
    const draftBefore = await readDraftProjection(
      context.client,
      setup.projection.workspaceId,
      setup.projection.definitionId,
    );

    const afterDrag = await dragNodeAndReadSnapshot(
      context.client,
      run.surfaceId,
      run.snapshot,
      "work",
      {
        x: 88,
        y: 44,
      },
    );
    assertOnlyNodeMoved(run.snapshot, afterDrag, "work", "read-only run drag");
    await delay(500);

    const draftAfter = await readDraftProjection(
      context.client,
      setup.projection.workspaceId,
      setup.projection.definitionId,
    );
    assertDraftLayoutUnchanged(draftBefore.projection, draftAfter.projection, "read-only run drag");

    const layout = await waitForExecutionViewLayout(context.client, afterDrag.graph.workflow, {
      nodeId: "work",
      snapshot: afterDrag,
    });
    assertViewLayoutMatchesSnapshot(layout, afterDrag, "work");

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      afterDrag,
      layout,
      scenario: "read-only-run-view-layout",
      status: "passed",
    });
  } catch (error) {
    await captureContractFailure(context, scenarioArtifactDir);
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function activeReplacementDuringDragScenario(scenarioArtifactDir) {
  const fixture = await createElectronFixture("workflow-graph-active-replacement-contract");
  let context = null;
  try {
    context = await launchContractContext(fixture, scenarioArtifactDir);
    const setup = await createAndOpenDraftWorkflow(context, fixture);
    await installContractDriver(context.client);

    const before = setup.snapshot;
    const drag = await beginWorkflowGraphMouseDrag(
      context.client,
      setup.surfaceId,
      before,
      "work",
      {
        x: 96,
        y: 52,
      },
    );
    const clicked = await context.client.driver("clickWorkflowToolbarButton", {
      surfaceId: setup.surfaceId,
      testId: "workflow-validate-button",
    });
    if (!clicked.ok) {
      throw new Error(
        `workflow validation during active drag was not started: ${JSON.stringify(clicked)}`,
      );
    }
    await delay(200);
    await releaseWorkflowGraphMouseDrag(context.client, drag);

    const afterRelease = await getWorkflowGraphSnapshot(context.client, setup.surfaceId);
    assertOnlyNodeMoved(before, afterRelease, "work", "active replacement drag");
    const persisted = await waitForDraftProjectionLayout(
      context.client,
      setup.projection.workspaceId,
      setup.projection.definitionId,
      afterRelease,
      "work",
    );

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      afterRelease,
      persisted: persisted.projection,
      scenario: "active-replacement-during-drag",
      status: "passed",
    });
  } catch (error) {
    await captureContractFailure(context, scenarioArtifactDir);
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function createAndOpenDraftWorkflow(context, fixture) {
  const projection = await createWorkflowProjectionFixture(context.client, fixture.workspaceRoot);
  const opened = await openDraftWorkflowGraph(context.client, fixture, projection);
  return { ...opened, projection };
}

async function openDraftWorkflowGraph(client, fixture, projection) {
  await client.installDriver();
  await client.driver("openWorkspacePath", { workspaceRoot: fixture.workspaceRoot });
  await reloadPage(client);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await openWorkflowGraphPane(client);
  await waitForSelector(client, '[data-testid="workflow-graph"]');
  const surfaceId = await maximizeWorkflowGraphPane(client);
  const snapshot = await waitForWorkflowGraphSnapshot(client, surfaceId, (candidate) =>
    isWorkflowProjectionSnapshotReady(candidate, projection),
  );
  return { snapshot, surfaceId };
}

async function openRunProjection(client, surfaceId, projection) {
  const run = await client.driver("runWorkflowDraftForSurface", {
    definitionId: projection.definitionId,
    surfaceId,
  });
  if (!run.ok) {
    throw new Error(`workflow run was not started: ${JSON.stringify(run)}`);
  }
  const snapshot = await waitForWorkflowGraphSnapshot(
    client,
    run.surfaceId,
    (candidate) =>
      candidate.graph.workflow?.definitionId === projection.definitionId &&
      candidate.graph.workflow?.editable === false &&
      candidate.graph.workflow?.executionId === run.executionId &&
      candidate.graph.workflow?.viewMode === "run",
  );
  return { executionId: run.executionId, snapshot, surfaceId: run.surfaceId };
}

async function launchContractContext(fixture, contextArtifactDir) {
  return launchElectronCdpContext({
    artifactDir: contextArtifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
    },
    fixture,
    visible: options.visible,
  });
}

async function installContractDriver(client) {
  const installed = await client.evaluate(
    `globalThis.__settaWorkflowGraphContractDriver?.version === ${JSON.stringify(
      contractDriverVersion,
    )}`,
  );
  if (!installed) {
    await client.evaluate(await readFile(contractDriverPath, "utf8"));
  }
}

async function contractDriver(client, method, args = {}) {
  await installContractDriver(client);
  return client.evaluate(contractDriverCallExpression(method, args));
}

function contractDriverCallExpression(method, args = {}) {
  return `globalThis.__settaWorkflowGraphContractDriver.${method}(${JSON.stringify(args)})`;
}

async function waitForWorkflowGraphSnapshot(client, surfaceId, predicate, timeoutMs) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", { surfaceId }),
    (value) => value.ready && predicate(value.snapshot),
    timeoutMs,
  ).then((value) => value.snapshot);
}

async function getWorkflowGraphSnapshot(client, surfaceId) {
  return client.driver("workflowGraphDebugSnapshot", { surfaceId });
}

async function dragNodeAndWaitForMove(client, surfaceId, snapshot, nodeId, delta) {
  const node = nodeById(snapshot, nodeId);
  await dispatchWorkflowGraphMouseDrag(client, surfaceId, {
    from: { x: node.screenX, y: node.screenY },
    steps: 14,
    to: { x: node.screenX + delta.x, y: node.screenY + delta.y },
  });
  return waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (candidate) => nodeMoved(snapshot, candidate, nodeId),
    5_000,
  );
}

async function dragNodeAndReadSnapshot(client, surfaceId, snapshot, nodeId, delta) {
  const node = nodeById(snapshot, nodeId);
  await dispatchWorkflowGraphMouseDrag(client, surfaceId, {
    from: { x: node.screenX, y: node.screenY },
    steps: 14,
    to: { x: node.screenX + delta.x, y: node.screenY + delta.y },
  });
  await delay(250);
  return getWorkflowGraphSnapshot(client, surfaceId);
}

async function beginWorkflowGraphMouseDrag(client, surfaceId, snapshot, nodeId, delta) {
  const node = nodeById(snapshot, nodeId);
  const from = { x: node.screenX, y: node.screenY };
  const to = { x: node.screenX + delta.x, y: node.screenY + delta.y };
  const pageFrom = await pagePointForCanvasPoint(client, surfaceId, from);
  const pageTo = await pagePointForCanvasPoint(client, surfaceId, to);
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: pageFrom.x,
    y: pageFrom.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: pageFrom.x,
    y: pageFrom.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: pageFrom.x + (pageTo.x - pageFrom.x) * 0.55,
    y: pageFrom.y + (pageTo.y - pageFrom.y) * 0.55,
  });
  await delay(32);
  return { pageTo };
}

async function releaseWorkflowGraphMouseDrag(client, { pageTo }) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: pageTo.x,
    y: pageTo.y,
  });
  await delay(250);
}

async function exerciseReadOnlyPortAffordance(client, surfaceId, snapshot, issues) {
  const source = firstPort(snapshot, "source");
  if (!source) {
    return;
  }
  await dispatchWorkflowGraphMouseMove(client, surfaceId, source);
  await delay(50);
  const cursor = await contractDriver(client, "workflowGraphCanvasCursor", { surfaceId });
  if (cursor === "crosshair" || cursor === "copy") {
    issues.push(`read-only run port advertised connection cursor ${JSON.stringify(cursor)}`);
  }
  await dispatchWorkflowGraphMouseDrag(client, surfaceId, {
    from: source,
    steps: 8,
    to: emptyCanvasPoint(snapshot),
  });
  await delay(100);
  const afterDrag = await getWorkflowGraphSnapshot(client, surfaceId);
  if (afterDrag.render.temporaryEdgeUpdateCount > snapshot.render.temporaryEdgeUpdateCount) {
    issues.push("read-only run port drag drew a temporary edge");
  }
  const beforeWorkflowEdges = workflowEdgeIds(snapshot);
  const afterWorkflowEdges = workflowEdgeIds(afterDrag);
  if (JSON.stringify(beforeWorkflowEdges) !== JSON.stringify(afterWorkflowEdges)) {
    issues.push(
      `read-only run port drag changed workflow edges: before=${JSON.stringify(
        beforeWorkflowEdges,
      )} after=${JSON.stringify(afterWorkflowEdges)}`,
    );
  }
}

async function readDraftProjection(client, workspaceId, definitionId) {
  return contractDriver(client, "readWorkflowGraphProjection", { definitionId, workspaceId });
}

async function waitForDraftProjectionLayout(client, workspaceId, definitionId, snapshot, nodeId) {
  return waitForState(
    client,
    contractDriverCallExpression("readWorkflowGraphProjection", { definitionId, workspaceId }),
    (response) =>
      response.projection && backendLayoutMatchesSnapshot(response.projection, snapshot, nodeId),
  );
}

async function waitForExecutionViewLayout(client, workflow, { nodeId, snapshot }) {
  return waitForState(
    client,
    contractDriverCallExpression("readWorkflowGraphViewLayout", {
      target: workflowExecutionViewLayoutTarget(workflow),
      workspaceId: workflow.workspaceId,
    }),
    (layout) => viewLayoutMatchesSnapshot(layout, snapshot, nodeId),
  );
}

function workflowExecutionViewLayoutTarget(workflow) {
  return {
    definitionVersion: null,
    kind: "workflow_execution",
    workflowExecution: {
      definitionId: workflow.definitionId,
      executionId: workflow.executionId,
      versionId: workflow.definitionVersionId,
    },
  };
}

function assertBackendLayoutMatchesSnapshot(projection, snapshot, nodeId) {
  const expected = nodeById(snapshot, nodeId);
  const actual = layoutNodeById(projection.layout, nodeId);
  assertClosePoint(
    actual,
    { x: Math.round(expected.x), y: Math.round(expected.y) },
    `${nodeId} backend layout`,
  );
}

function backendLayoutMatchesSnapshot(projection, snapshot, nodeId) {
  return pointMatchesSnapshotLayout(projection.layout.nodes, snapshot, nodeId);
}

function assertViewLayoutMatchesSnapshot(layout, snapshot, nodeId) {
  const expected = nodeById(snapshot, nodeId);
  const actual = layoutNodeById({ nodes: layout.positions }, nodeId);
  assertClosePoint(
    actual,
    { x: Math.round(expected.x), y: Math.round(expected.y) },
    `${nodeId} view layout`,
  );
}

function viewLayoutMatchesSnapshot(layout, snapshot, nodeId) {
  return pointMatchesSnapshotLayout(layout.positions, snapshot, nodeId);
}

function pointMatchesSnapshotLayout(positions, snapshot, nodeId) {
  const expected = nodeById(snapshot, nodeId);
  const actual = positions.find((candidate) => candidate.nodeId === nodeId);
  if (!actual) {
    return false;
  }
  return Math.hypot(actual.x - Math.round(expected.x), actual.y - Math.round(expected.y)) <= 1.5;
}

function assertDraftLayoutUnchanged(before, after, label) {
  if (JSON.stringify(before.layout.nodes) !== JSON.stringify(after.layout.nodes)) {
    throw new Error(
      `${label} changed draft definition layout: before=${JSON.stringify(
        before.layout,
      )} after=${JSON.stringify(after.layout)}`,
    );
  }
}

function assertOnlyNodeMoved(before, after, movedNodeId, label) {
  for (const beforeNode of before.graph.nodes) {
    const afterNode = nodeById(after, beforeNode.id);
    const moved = distance(beforeNode, afterNode) > 1;
    if (beforeNode.id === movedNodeId && !moved) {
      throw new Error(`${label} did not move ${movedNodeId}`);
    }
    if (beforeNode.id !== movedNodeId && moved) {
      throw new Error(
        `${label} moved unexpected node ${beforeNode.id}: before=${JSON.stringify(
          beforeNode,
        )} after=${JSON.stringify(afterNode)}`,
      );
    }
  }
}

function nodeMoved(before, after, nodeId) {
  return distance(nodeById(before, nodeId), nodeById(after, nodeId)) > 1;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function assertClosePoint(actual, expected, label) {
  const delta = Math.hypot(actual.x - expected.x, actual.y - expected.y);
  if (delta > 1.5) {
    throw new Error(
      `${label} mismatch: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
    );
  }
}

function nodeById(snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`workflow graph node ${nodeId} was missing: ${JSON.stringify(snapshot.graph)}`);
  }
  return node;
}

function layoutNodeById(layout, nodeId) {
  const node = layout.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node) {
    throw new Error(`layout node ${nodeId} was missing: ${JSON.stringify(layout)}`);
  }
  return node;
}

function interactivePortCount(snapshot) {
  return snapshot.graph.nodes.reduce((total, node) => total + node.ports.length, 0);
}

function workflowEdgeIds(snapshot) {
  return snapshot.graph.edges
    .filter((edge) => edge.layer === "workflow")
    .map((edge) => edge.id)
    .sort();
}

function firstPort(snapshot, role) {
  for (const node of snapshot.graph.nodes) {
    const port = node.ports.find((candidate) => candidate.role === role);
    if (port) {
      return { x: port.screenX, y: port.screenY };
    }
  }
  return null;
}

function emptyCanvasPoint(snapshot) {
  return {
    x: Math.max(48, snapshot.canvas.clientWidth - 72),
    y: Math.max(48, snapshot.canvas.clientHeight - 72),
  };
}

async function captureContractFailure(context, scenarioArtifactDir) {
  if (!context) {
    return;
  }
  await captureScreenshot(context.client, join(scenarioArtifactDir, "failure.png")).catch(() => {});
  await getWorkflowGraphSnapshot(context.client, null)
    .then((snapshot) => writeJson(join(scenarioArtifactDir, "failure-snapshot.json"), snapshot))
    .catch(() => {});
}

function parseContractArgs(argv) {
  const harnessArgs = [];
  let scenario = "all";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scenario") {
      scenario = requiredArgValue(argv, index, "--scenario");
      index += 1;
      continue;
    }
    harnessArgs.push(arg);
    if (arg === "--artifact-dir") {
      harnessArgs.push(requiredArgValue(argv, index, "--artifact-dir"));
      index += 1;
    }
  }
  return { ...parseElectronHarnessArgs(harnessArgs), scenario };
}

function requiredArgValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage: node desktop/tests/electron/workflow-graph-durable-drag-contract.test.mjs [--scenario <name|all>] [--skip-build] [--visible] [--artifact-dir <dir>]

Scenarios:
  ${Object.keys(scenarioHandlers).join("\n  ")}
`);
}
