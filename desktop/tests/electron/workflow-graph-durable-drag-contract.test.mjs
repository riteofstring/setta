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
  dispatchKeyEvent,
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
  dispatchWorkflowGraphMouseDrag,
  dispatchWorkflowGraphMouseClick,
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
const contractDriverVersion = "setta-workflow-graph-contract-driver-v2";
const cdpShiftModifier = 8;
const scenarioHandlers = {
  "active-replacement-during-drag": activeReplacementDuringDragScenario,
  "edge-draw-pointercancel": edgeDrawPointerCancelScenario,
  "editable-draft-durability": editableDraftDurabilityScenario,
  "live-runtime-drag": liveRuntimeDragScenario,
  "marquee-pointercancel": marqueePointerCancelScenario,
  "node-drag-pointercancel": nodeDragPointerCancelScenario,
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
    const addEdgeIpcBefore = await workflowAddEdgeIpcCount(scenarioArtifactDir);

    const issues = [];
    const portCount = interactivePortCount(run.snapshot);
    if (portCount !== 0) {
      issues.push(`read-only run projection exposed ${portCount} interactive workflow ports`);
      await exerciseReadOnlyPortAffordance(context.client, run.surfaceId, run.snapshot, issues);
    }
    await delay(250);
    const addEdgeIpcAfter = await workflowAddEdgeIpcCount(scenarioArtifactDir);
    const addEdgeIpcDelta = addEdgeIpcAfter - addEdgeIpcBefore;
    if (addEdgeIpcDelta !== 0) {
      issues.push(
        `read-only run port interaction issued workflow:add-edge IPC starts: before=${addEdgeIpcBefore} after=${addEdgeIpcAfter}`,
      );
    }
    if (issues.length > 0) {
      throw new Error(issues.join("\n"));
    }

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      addEdgeIpc: {
        after: addEdgeIpcAfter,
        before: addEdgeIpcBefore,
        delta: addEdgeIpcDelta,
      },
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
    assertOnlyWorkflowNodeMoved(run.snapshot, afterDrag, "work", "read-only run drag");
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

    await reloadPage(context.client);
    await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
    await waitForSelector(context.client, '[data-testid="workflow-graph"]');
    const reloaded = await waitForRunProjectionRestored(
      context.client,
      run.surfaceId,
      run.snapshot.graph.workflow,
    );
    assertViewLayoutMatchesSnapshot(layout, reloaded, "work");

    await stopElectronCdpContext(context);
    context = await launchContractContext(fixture, join(scenarioArtifactDir, "relaunch"));
    await installContractDriver(context.client);
    await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
    await waitForSelector(context.client, '[data-testid="workflow-graph"]');
    const relaunched = await waitForRunProjectionRestored(
      context.client,
      run.surfaceId,
      run.snapshot.graph.workflow,
    );
    assertViewLayoutMatchesSnapshot(layout, relaunched, "work");

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      afterDrag,
      layout,
      relaunched,
      reloaded,
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

async function nodeDragPointerCancelScenario(scenarioArtifactDir) {
  const fixture = await createElectronFixture("workflow-graph-node-drag-pointercancel-contract");
  let context = null;
  try {
    context = await launchContractContext(fixture, scenarioArtifactDir);
    const setup = await createAndOpenDraftWorkflow(context, fixture);
    await installContractDriver(context.client);

    const before = setup.snapshot;
    const draftBefore = await readDraftProjection(
      context.client,
      setup.projection.workspaceId,
      setup.projection.definitionId,
    );
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
    const duringDrag = await getWorkflowGraphSnapshot(context.client, setup.surfaceId);
    if (!nodeMoved(before, duringDrag, "work")) {
      throw new Error(
        `node drag pointercancel scenario did not start a visible drag: ${JSON.stringify(
          duringDrag.graph.nodes,
        )}`,
      );
    }
    await dispatchWorkflowGraphPointerCancel(context.client, drag.pageTo);

    const afterCancel = await getWorkflowGraphSnapshot(context.client, setup.surfaceId);
    assertNodePositionUnchanged(before, afterCancel, "work", "node drag pointercancel");
    await delay(500);
    const draftAfter = await readDraftProjection(
      context.client,
      setup.projection.workspaceId,
      setup.projection.definitionId,
    );
    assertDraftLayoutUnchanged(
      draftBefore.projection,
      draftAfter.projection,
      "node drag pointercancel",
    );

    const clicked = await context.client.driver("clickWorkflowToolbarButton", {
      surfaceId: setup.surfaceId,
      testId: "workflow-validate-button",
    });
    if (!clicked.ok) {
      throw new Error(
        `workflow validation after pointercancel was not started: ${JSON.stringify(clicked)}`,
      );
    }
    const refreshed = await waitForWorkflowGraphSnapshot(
      context.client,
      setup.surfaceId,
      (candidate) => candidate.graph.workflow?.definitionId === setup.projection.definitionId,
    );
    assertNodePositionUnchanged(before, refreshed, "work", "node drag pointercancel refresh");

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      afterCancel,
      refreshed,
      scenario: "node-drag-pointercancel",
      status: "passed",
    });
  } catch (error) {
    await captureContractFailure(context, scenarioArtifactDir);
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function edgeDrawPointerCancelScenario(scenarioArtifactDir) {
  const fixture = await createElectronFixture("workflow-graph-edge-draw-pointercancel-contract");
  let context = null;
  try {
    context = await launchContractContext(fixture, scenarioArtifactDir);
    const setup = await createAndOpenDraftWorkflow(context, fixture);
    await installContractDriver(context.client);

    const before = setup.snapshot;
    const addEdgeIpcBefore = await workflowAddEdgeIpcCount(scenarioArtifactDir);
    const draftBefore = await readDraftProjection(
      context.client,
      setup.projection.workspaceId,
      setup.projection.definitionId,
    );
    const sourcePort = requiredPort(before, "start", "output");
    const targetPort = requiredPort(before, "end", "input");
    const drag = await beginWorkflowGraphMouseDragAtPoints(
      context.client,
      setup.surfaceId,
      { x: sourcePort.screenX, y: sourcePort.screenY },
      { x: targetPort.screenX, y: targetPort.screenY },
    );
    await waitForWorkflowGraphSnapshot(
      context.client,
      setup.surfaceId,
      (candidate) => candidate.interaction.drawingEdge,
      5_000,
    );
    await dispatchWorkflowGraphPointerCancel(context.client, drag.pageTo);
    await delay(500);

    const afterCancel = await getWorkflowGraphSnapshot(context.client, setup.surfaceId);
    const addEdgeIpcAfter = await workflowAddEdgeIpcCount(scenarioArtifactDir);
    const addEdgeIpcDelta = addEdgeIpcAfter - addEdgeIpcBefore;
    if (addEdgeIpcDelta !== 0) {
      throw new Error(
        `edge draw pointercancel issued workflow:add-edge IPC starts: before=${addEdgeIpcBefore} after=${addEdgeIpcAfter}`,
      );
    }
    assertWorkflowEdgesUnchanged(before, afterCancel, "edge draw pointercancel");
    const draftAfter = await readDraftProjection(
      context.client,
      setup.projection.workspaceId,
      setup.projection.definitionId,
    );
    assertDraftEdgesUnchanged(
      draftBefore.projection,
      draftAfter.projection,
      "edge draw pointercancel",
    );

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      addEdgeIpc: {
        after: addEdgeIpcAfter,
        before: addEdgeIpcBefore,
        delta: addEdgeIpcDelta,
      },
      afterCancel,
      scenario: "edge-draw-pointercancel",
      status: "passed",
    });
  } catch (error) {
    await captureContractFailure(context, scenarioArtifactDir);
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function marqueePointerCancelScenario(scenarioArtifactDir) {
  const fixture = await createElectronFixture("workflow-graph-marquee-pointercancel-contract");
  let context = null;
  try {
    context = await launchContractContext(fixture, scenarioArtifactDir);
    const setup = await createAndOpenDraftWorkflow(context, fixture);
    await installContractDriver(context.client);

    const before = setup.snapshot;
    const selected = nodeById(before, "work");
    await dispatchWorkflowGraphMouseClick(context.client, setup.surfaceId, {
      x: selected.screenX,
      y: selected.screenY,
    });
    const beforeMarquee = await waitForWorkflowGraphSnapshot(
      context.client,
      setup.surfaceId,
      (candidate) => selectedNodeIds(candidate).includes("work"),
    );
    const marquee = marqueeForNodes(beforeMarquee, ["end"]);
    await dispatchKeyEvent(context.client, {
      code: "ShiftLeft",
      key: "Shift",
      modifiers: cdpShiftModifier,
      type: "keyDown",
      windowsVirtualKeyCode: 16,
    });
    await beginWorkflowGraphMouseDragAtPoints(
      context.client,
      setup.surfaceId,
      marquee.from,
      marquee.to,
      { modifiers: cdpShiftModifier },
    );
    const activeMarquee = await waitForWorkflowGraphSnapshotOrNull(
      context.client,
      setup.surfaceId,
      (candidate) => candidate.interaction.drawingMarquee,
      5_000,
    );
    if (!activeMarquee) {
      const current = await getWorkflowGraphSnapshot(context.client, setup.surfaceId);
      throw new Error(
        `marquee pointercancel did not enter marquee selection: interaction=${JSON.stringify(
          current.interaction,
        )}`,
      );
    }
    const clicked = await context.client.driver("clickWorkflowToolbarButton", {
      surfaceId: setup.surfaceId,
      testId: "workflow-validate-button",
    });
    if (!clicked.ok) {
      throw new Error(
        `workflow validation during marquee was not started: ${JSON.stringify(clicked)}`,
      );
    }
    await delay(100);
    await dispatchWorkflowGraphPointerCancel(
      context.client,
      await pagePointForCanvasPoint(context.client, setup.surfaceId, marquee.to),
    );
    await dispatchKeyEvent(context.client, {
      code: "ShiftLeft",
      key: "Shift",
      type: "keyUp",
      windowsVirtualKeyCode: 16,
    });

    const afterCancel = await getWorkflowGraphSnapshot(context.client, setup.surfaceId);
    assertSelectedExactly(afterCancel, ["work"], "marquee pointercancel");

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      afterCancel,
      beforeMarquee,
      scenario: "marquee-pointercancel",
      status: "passed",
    });
  } catch (error) {
    await captureContractFailure(context, scenarioArtifactDir);
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function liveRuntimeDragScenario(scenarioArtifactDir) {
  const fixture = await createElectronFixture("workflow-graph-live-runtime-drag-contract");
  let context = null;
  try {
    context = await launchContractContext(fixture, scenarioArtifactDir);
    const setup = await createAndOpenDraftWorkflow(context, fixture);
    await installContractDriver(context.client);
    const semanticSeedId = "workflow_graph_contract_runtime_seed";
    const seed = await contractDriver(context.client, "createSemanticRuntimeSeed", {
      definitionId: setup.projection.definitionId,
      targetEntityId: semanticSeedId,
      workflowNodeId: "work",
      workspaceId: setup.projection.workspaceId,
    });
    if (!seed.ok) {
      throw new Error(`semantic runtime seed was not attached: ${JSON.stringify(seed)}`);
    }
    const run = await openRunProjection(context.client, setup.surfaceId, setup.projection);

    const before = run.snapshot;
    const initialRuntimeSourceCount = runtimeSourceCount(before, "work");
    const initialDeferredGraphUpdateCount = before.render.deferredGraphUpdateCount ?? 0;
    const drag = await beginWorkflowGraphMouseDrag(context.client, run.surfaceId, before, "work", {
      x: 92,
      y: 48,
    });
    const burst = await contractDriver(context.client, "startSemanticRuntimeBurst", {
      count: 10,
      definitionId: setup.projection.definitionId,
      delayMs: 16,
      executionId: run.executionId,
      targetEntityId: semanticSeedId,
      workflowNodeId: "work",
      workspaceId: setup.projection.workspaceId,
    });
    if (!burst.ok) {
      throw new Error(`semantic runtime burst was not started: ${JSON.stringify(burst)}`);
    }
    const runtimeDeferred = await waitForWorkflowGraphSnapshotOrNull(
      context.client,
      run.surfaceId,
      (candidate) =>
        (candidate.render.deferredGraphUpdateCount ?? 0) > initialDeferredGraphUpdateCount &&
        nodeMoved(before, candidate, "work") &&
        runtimeSourceCount(candidate, "work") === initialRuntimeSourceCount,
      10_000,
    );
    if (!runtimeDeferred) {
      const current = await getWorkflowGraphSnapshot(context.client, run.surfaceId);
      throw new Error(
        `live runtime drag did not defer runtime graph updates: initialDeferredGraphUpdateCount=${initialDeferredGraphUpdateCount} currentDeferredGraphUpdateCount=${current.render.deferredGraphUpdateCount} beforePosition=${JSON.stringify(
          nodePosition(before, "work"),
        )} currentPosition=${JSON.stringify(nodePosition(current, "work"))} initialSourceCount=${initialRuntimeSourceCount} currentSourceCount=${runtimeSourceCount(
          current,
          "work",
        )}`,
      );
    }
    await releaseWorkflowGraphMouseDrag(context.client, drag);
    const burstResult = await contractDriver(context.client, "semanticRuntimeBurstResult", {
      token: burst.token,
    });
    if (!burstResult.ok) {
      throw new Error(`semantic runtime burst failed: ${JSON.stringify(burstResult)}`);
    }

    const afterRelease = await waitForWorkflowGraphSnapshotOrNull(
      context.client,
      run.surfaceId,
      (candidate) =>
        nodeMoved(before, candidate, "work") &&
        runtimeSourceCount(candidate, "work") > initialRuntimeSourceCount,
      10_000,
    );
    if (!afterRelease) {
      const current = await getWorkflowGraphSnapshot(context.client, run.surfaceId);
      throw new Error(
        `live runtime drag did not preserve the dragged node while runtime updates flowed: before=${JSON.stringify(
          nodePosition(before, "work"),
        )} after=${JSON.stringify(nodePosition(current, "work"))} initialSourceCount=${initialRuntimeSourceCount} currentSourceCount=${runtimeSourceCount(
          current,
          "work",
        )}`,
      );
    }
    assertOnlyWorkflowNodeMoved(before, afterRelease, "work", "live runtime drag");
    const layout = await waitForExecutionViewLayout(context.client, afterRelease.graph.workflow, {
      nodeId: "work",
      snapshot: afterRelease,
    });
    assertViewLayoutMatchesSnapshot(layout, afterRelease, "work");

    await writeJson(join(scenarioArtifactDir, "summary.json"), {
      afterRelease,
      burstResult,
      layout,
      runtimeDeferred,
      scenario: "live-runtime-drag",
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

async function waitForRunProjectionRestored(client, surfaceId, workflow) {
  return waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (candidate) => workflowMatchesRestoredRun(candidate.graph.workflow, workflow),
    15_000,
  );
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

async function waitForWorkflowGraphSnapshotOrNull(client, surfaceId, predicate, timeoutMs) {
  try {
    return await waitForWorkflowGraphSnapshot(client, surfaceId, predicate, timeoutMs);
  } catch (error) {
    if (isStateWaitTimeout(error)) {
      return null;
    }
    throw error;
  }
}

function isStateWaitTimeout(error) {
  return (
    error instanceof Error && error.message.startsWith("timed out waiting for Electron CDP state:")
  );
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
  return beginWorkflowGraphMouseDragAtPoints(
    client,
    surfaceId,
    { x: node.screenX, y: node.screenY },
    { x: node.screenX + delta.x, y: node.screenY + delta.y },
  );
}

async function beginWorkflowGraphMouseDragAtPoints(
  client,
  surfaceId,
  from,
  to,
  { modifiers = 0 } = {},
) {
  const pageFrom = await pagePointForCanvasPoint(client, surfaceId, from);
  const pageTo = await pagePointForCanvasPoint(client, surfaceId, to);
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    modifiers,
    type: "mouseMoved",
    x: pageFrom.x,
    y: pageFrom.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
    type: "mousePressed",
    x: pageFrom.x,
    y: pageFrom.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    modifiers,
    type: "mouseMoved",
    x: pageFrom.x + (pageTo.x - pageFrom.x) * 0.55,
    y: pageFrom.y + (pageTo.y - pageFrom.y) * 0.55,
  });
  await delay(32);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    modifiers,
    type: "mouseMoved",
    x: pageTo.x,
    y: pageTo.y,
  });
  await delay(32);
  return { pageFrom, pageTo };
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

async function dispatchWorkflowGraphPointerCancel(client, pagePoint) {
  await client.evaluate(`(() => {
    const event = new PointerEvent("pointercancel", {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: ${JSON.stringify(pagePoint.x)},
      clientY: ${JSON.stringify(pagePoint.y)},
      pointerId: 1,
      pointerType: "mouse",
    });
    window.dispatchEvent(event);
  })()`);
  await delay(150);
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

async function workflowAddEdgeIpcCount(artifactDir) {
  const rows = await readJsonLinesOptional(join(artifactDir, "ipc.jsonl"));
  return rows.filter((row) => row.type === "ipc_start" && row.channel === "workflow:add-edge")
    .length;
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

function assertDraftEdgesUnchanged(before, after, label) {
  if (JSON.stringify(before.edges) !== JSON.stringify(after.edges)) {
    throw new Error(
      `${label} changed draft definition edges: before=${JSON.stringify(
        before.edges,
      )} after=${JSON.stringify(after.edges)}`,
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
        `${label} moved unexpected node ${beforeNode.id}: before=${JSON.stringify({
          x: beforeNode.x,
          y: beforeNode.y,
        })} after=${JSON.stringify({ x: afterNode.x, y: afterNode.y })}`,
      );
    }
  }
}

function assertOnlyWorkflowNodeMoved(before, after, movedNodeId, label) {
  const workflowBefore = {
    ...before,
    graph: {
      ...before.graph,
      nodes: before.graph.nodes.filter((node) => node.layer === "workflow"),
    },
  };
  assertOnlyNodeMoved(workflowBefore, after, movedNodeId, label);
}

function assertNodePositionUnchanged(before, after, nodeId, label) {
  const beforeNode = nodeById(before, nodeId);
  const afterNode = nodeById(after, nodeId);
  if (distance(beforeNode, afterNode) > 1) {
    throw new Error(
      `${label} moved ${nodeId}: before=${JSON.stringify({
        x: beforeNode.x,
        y: beforeNode.y,
      })} after=${JSON.stringify({ x: afterNode.x, y: afterNode.y })}`,
    );
  }
}

function assertWorkflowEdgesUnchanged(before, after, label) {
  const beforeEdges = workflowEdgeIds(before);
  const afterEdges = workflowEdgeIds(after);
  if (JSON.stringify(beforeEdges) !== JSON.stringify(afterEdges)) {
    throw new Error(
      `${label} changed workflow edges: before=${JSON.stringify(
        beforeEdges,
      )} after=${JSON.stringify(afterEdges)}`,
    );
  }
}

function assertSelectedExactly(snapshot, expected, label) {
  const actual = selectedNodeIds(snapshot).sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `${label} selection mismatch: actual=${JSON.stringify(
        actual,
      )} expected=${JSON.stringify(sortedExpected)}`,
    );
  }
}

function nodeMoved(before, after, nodeId) {
  return distance(nodeById(before, nodeId), nodeById(after, nodeId)) > 1;
}

function nodePosition(snapshot, nodeId) {
  const node = nodeById(snapshot, nodeId);
  return { x: node.x, y: node.y };
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

function requiredPort(snapshot, nodeId, portId) {
  const node = nodeById(snapshot, nodeId);
  const port = node.ports.find((candidate) => candidate.id === portId);
  if (!port) {
    throw new Error(`workflow graph port ${nodeId}:${portId} was missing: ${JSON.stringify(node)}`);
  }
  return port;
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

function selectedNodeIds(snapshot) {
  return [...(snapshot.interaction.selectedNodeIds ?? [])];
}

function marqueeForNodes(snapshot, nodeIds) {
  const nodes = nodeIds.map((nodeId) => nodeById(snapshot, nodeId));
  const margin = 48;
  const minX = Math.max(
    24,
    Math.min(...nodes.map((node) => node.screenX - node.width / 2)) - margin,
  );
  const minY = Math.max(
    24,
    Math.min(...nodes.map((node) => node.screenY - node.height / 2)) - margin,
  );
  const maxX = Math.min(
    snapshot.canvas.clientWidth - 24,
    Math.max(...nodes.map((node) => node.screenX + node.width / 2)) + margin,
  );
  const maxY = Math.min(
    snapshot.canvas.clientHeight - 24,
    Math.max(...nodes.map((node) => node.screenY + node.height / 2)) + margin,
  );
  return {
    from: { x: minX, y: minY },
    to: { x: maxX, y: maxY },
  };
}

function runtimeSourceCount(snapshot, nodeId) {
  return Number(nodeById(snapshot, nodeId).runtime?.sourceCount ?? 0);
}

function workflowMatchesRestoredRun(actual, expected) {
  if (!actual) {
    return false;
  }
  const expectedRun = {
    definitionId: expected.definitionId,
    definitionVersionId: expected.definitionVersionId,
    editable: false,
    executionId: expected.executionId,
    viewMode: expected.viewMode,
  };
  return workflowRunProjectionKey(actual) === workflowRunProjectionKey(expectedRun);
}

function workflowRunProjectionKey(workflow) {
  return [
    workflow.definitionId,
    workflow.definitionVersionId,
    String(workflow.editable),
    workflow.executionId,
    workflow.viewMode,
  ].join("\u0000");
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
