/* global console */

import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

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
  dispatchWorkflowGraphWheel,
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";
import { createWorkflowProjectionFixture } from "./workflow-projection-smoke-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const scriptedNavigationPrompt = "workflow hold for draft event";
const expectedWorkflowNodeIds = ["start", "work", "end"];
// Keep these CDP wheel values aligned with the renderer's private wheel constants in
// desktop/src/renderer/src/features/workspace-graph/pixi-renderer-helpers.js.
const workflowWheelZoomSensitivity = 0.018;
const workflowWheelZoomThreshold = 80;
const maxVerticalWheelPanDelta = workflowWheelZoomThreshold - 1;
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
  await captureWorkflowRunNavigationScreenshot(
    context.client,
    workflowGraphSurfaceId,
    join(artifactDir, "draft-no-active-run.png"),
    { label: "draft-no-active-run" },
  );

  const firstExecutionId = await startWorkflowRunWithValidationOverlayCheck(
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
  await captureWorkflowRunNavigationScreenshot(
    context.client,
    workflowGraphSurfaceId,
    join(artifactDir, "draft-active-run.png"),
    { label: "draft-active-run" },
  );

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
  // The draft validation overlay must stay absent in run views, not just at the Starting frame.
  await waitForWorkflowValidationPanel(context.client, (state) => !state.exists);
  await captureWorkflowRunNavigationScreenshot(
    context.client,
    workflowGraphSurfaceId,
    join(artifactDir, "active-run-view.png"),
    { includeVisibleActivityChips: true, label: "active-run-view" },
  );

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
  await captureWorkflowRunNavigationScreenshot(
    context.client,
    workflowGraphSurfaceId,
    join(artifactDir, "run-selector-active-history.png"),
    { includeVisibleActivityChips: true, label: "run-selector-active-history" },
  );
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
  await captureWorkflowRunNavigationScreenshot(
    context.client,
    workflowGraphSurfaceId,
    join(artifactDir, "historical-run-selected.png"),
    { includeVisibleActivityChips: true, label: "historical-run-selected" },
  );

  await context.client.call("Emulation.setDeviceMetricsOverride", narrowToolbarViewport);
  await waitForWorkflowGraphSnapshot(
    context.client,
    workflowGraphSurfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.executionId === firstExecutionId &&
      snapshot.canvas.clientWidth > 0 &&
      snapshot.canvas.clientWidth < historicalProjection.canvas.clientWidth,
  );
  await fitWorkflowGraphEvidence(context.client, workflowGraphSurfaceId, {
    includeVisibleActivityChips: true,
    keyNodeIds: ["work"],
    label: "run-selector-narrow-toolbar",
  });
  await openWorkflowRunSelector(context.client);
  const narrowSelector = await waitForRunSelectorState(
    context.client,
    (state) =>
      state.menuOpen &&
      state.toolbarVisible &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${firstExecutionId}`) &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${secondExecutionId}`),
  );
  await assertWorkflowGraphEvidenceFramed(
    await getWorkflowGraphSnapshot(context.client, workflowGraphSurfaceId),
    {
      includeVisibleActivityChips: true,
      keyNodeIds: ["work"],
      label: "run-selector-narrow-toolbar",
    },
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

async function startWorkflowRunWithValidationOverlayCheck(client, surfaceId, definitionId) {
  // Surface a "valid" draft validation panel, then prove that accepting the run clears it
  // synchronously: it must be gone at the Starting frame, not lingering until the run loads.
  await clickWorkflowToolbarButton(client, "workflow-validate-button");
  await waitForWorkflowValidationPanel(
    client,
    (state) => state.exists && state.text.includes("Workflow draft is valid"),
  );
  await waitForToolbarButtonState(
    client,
    "workflow-run-button",
    (state) => state.exists && !state.disabled && state.text.includes("Run"),
  );
  await client.installDriver();
  const accepted = await client.driver("clickWorkflowRunAndReadStartFrame");
  if (!accepted.clicked) {
    throw new Error(`workflow run button was not clickable: ${JSON.stringify(accepted)}`);
  }
  if (!accepted.observedStartingFrame) {
    throw new Error(`run accept never exposed a Starting frame: ${JSON.stringify(accepted)}`);
  }
  if (accepted.validationPanelPresent) {
    throw new Error(
      `draft validation panel lingered into the Starting frame: ${JSON.stringify(accepted)}`,
    );
  }
  const runProjection = await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.viewMode === "run" &&
      snapshot.graph.workflow?.executionId !== "",
  );
  await waitForWorkflowValidationPanel(client, (state) => !state.exists);
  return runProjection.graph.workflow.executionId;
}

async function waitForWorkflowValidationPanel(client, predicate) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowValidationPanelState"),
    predicate,
    20_000,
  );
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

async function captureWorkflowRunNavigationScreenshot(client, surfaceId, path, options = {}) {
  const snapshot = await fitWorkflowGraphEvidence(client, surfaceId, options);
  await assertWorkflowGraphEvidenceFramed(snapshot, options);
  await captureScreenshot(client, path);
}

async function fitWorkflowGraphEvidence(client, surfaceId, options = {}) {
  let snapshot = await getWorkflowGraphSnapshot(client, surfaceId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const evidence = workflowGraphEvidence(snapshot, options);
    const violation = workflowGraphEvidenceViolation(evidence);
    if (violation === null) {
      return snapshot;
    }

    const targetZoom = workflowGraphEvidenceTargetZoom(snapshot, evidence, options);
    if (targetZoom < snapshot.camera.zoom - 0.01) {
      await zoomWorkflowGraphEvidence(client, surfaceId, snapshot, targetZoom);
      snapshot = await getWorkflowGraphSnapshot(client, surfaceId);
      continue;
    }

    const shift = workflowGraphEvidenceCenterShift(evidence);
    if (Math.abs(shift.x) > 1 || Math.abs(shift.y) > 1) {
      await panWorkflowGraphEvidence(client, surfaceId, snapshot, shift);
      snapshot = await getWorkflowGraphSnapshot(client, surfaceId);
      continue;
    }

    break;
  }

  await assertWorkflowGraphEvidenceFramed(snapshot, options);
  return snapshot;
}

async function assertWorkflowGraphEvidenceFramed(snapshot, options = {}) {
  const evidence = workflowGraphEvidence(snapshot, options);
  const violation = workflowGraphEvidenceViolation(evidence);
  if (violation !== null) {
    throw new Error(
      `${evidence.label} workflow graph evidence is clipped: ${violation} evidence=${JSON.stringify(evidence)}`,
    );
  }
}

async function zoomWorkflowGraphEvidence(client, surfaceId, snapshot, targetZoom) {
  await dispatchWorkflowGraphWheel(client, surfaceId, {
    deltaY: -Math.log(targetZoom / snapshot.camera.zoom) / workflowWheelZoomSensitivity,
    modifiers: 2,
    x: Math.floor(snapshot.canvas.clientWidth / 2),
    y: Math.floor(snapshot.canvas.clientHeight / 2),
  });
  await delay(120);
}

async function panWorkflowGraphEvidence(client, surfaceId, snapshot, shift) {
  for (const delta of workflowGraphEvidencePanWheelDeltas(shift)) {
    await dispatchWorkflowGraphWheel(client, surfaceId, {
      deltaX: delta.x,
      deltaY: delta.y,
      x: Math.floor(snapshot.canvas.clientWidth / 2),
      y: Math.floor(snapshot.canvas.clientHeight / 2),
    });
    await delay(40);
  }
  await delay(120);
}

function workflowGraphEvidencePanWheelDeltas(shift) {
  const deltas = [];
  let remainingX = -shift.x;
  let remainingY = -shift.y;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    if (Math.abs(remainingX) <= 0.5 && Math.abs(remainingY) <= 0.5) {
      return deltas;
    }
    let deltaX = remainingX;
    let deltaY = remainingY;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) >= workflowWheelZoomThreshold) {
      deltaY = Math.sign(deltaY) * maxVerticalWheelPanDelta;
    }
    deltas.push({ x: deltaX, y: deltaY });
    remainingX -= deltaX;
    remainingY -= deltaY;
  }
  throw new Error(`workflow graph evidence pan did not converge: ${JSON.stringify(shift)}`);
}

function workflowGraphEvidence(snapshot, options) {
  const keyNodeIds = options.keyNodeIds ?? expectedWorkflowNodeIds;
  const boxes = [
    ...workflowNodeEvidenceBoxes(snapshot, keyNodeIds),
    ...workflowActivityChipEvidenceBoxes(snapshot, options),
  ];
  if (boxes.length === 0) {
    throw new Error(
      `${options.label ?? "workflow evidence"} did not expose graph evidence boxes: ${JSON.stringify(snapshot.graph)}`,
    );
  }
  return {
    boxes,
    bounds: unionEvidenceBoxes(boxes),
    label: options.label ?? "workflow evidence",
    rect: workflowEvidenceCanvasRect(snapshot),
    zoom: snapshot.camera.zoom,
  };
}

function workflowNodeEvidenceBoxes(snapshot, keyNodeIds) {
  return keyNodeIds.map((nodeId) => {
    const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new Error(
        `workflow graph evidence missing expected node ${nodeId}: ${JSON.stringify(snapshot.graph.nodes)}`,
      );
    }
    return workflowNodeEvidenceBox(snapshot, node);
  });
}

function workflowActivityChipEvidenceBoxes(snapshot, options) {
  if (!options.includeVisibleActivityChips) {
    return [];
  }
  return (snapshot.visualGrammar?.activityChips ?? [])
    .filter((chip) => chip.visible)
    .map((chip) => ({
      bottom: chip.screenBounds.bottom,
      id: `activity-chip:${chip.id}`,
      left: chip.screenBounds.left,
      right: chip.screenBounds.right,
      top: chip.screenBounds.top,
    }));
}

function workflowNodeEvidenceBox(snapshot, node) {
  const halfWidth = (node.width * snapshot.camera.zoom) / 2;
  const halfHeight = (node.height * snapshot.camera.zoom) / 2;
  return {
    bottom: node.screenY + halfHeight,
    id: `node:${node.id}`,
    kind: "node",
    labelVisible: node.label?.visible === true,
    labelVisibilityReason: node.label?.visibilityReason ?? "",
    left: node.screenX - halfWidth,
    right: node.screenX + halfWidth,
    top: node.screenY - halfHeight,
  };
}

function workflowEvidenceCanvasRect(snapshot) {
  const horizontalMargin = 28;
  const verticalMargin = 28;
  return {
    bottom: snapshot.canvas.clientHeight - verticalMargin,
    left: horizontalMargin,
    right: snapshot.canvas.clientWidth - horizontalMargin,
    top: Math.min(220, Math.max(verticalMargin, snapshot.canvas.clientHeight * 0.34)),
  };
}

function workflowGraphEvidenceViolation(evidence) {
  for (const box of evidence.boxes) {
    if (box.left < evidence.rect.left) {
      return `${box.id} left ${box.left} < ${evidence.rect.left}`;
    }
    if (box.right > evidence.rect.right) {
      return `${box.id} right ${box.right} > ${evidence.rect.right}`;
    }
    if (box.top < evidence.rect.top) {
      return `${box.id} top ${box.top} < ${evidence.rect.top}`;
    }
    if (box.bottom > evidence.rect.bottom) {
      return `${box.id} bottom ${box.bottom} > ${evidence.rect.bottom}`;
    }
    if (box.kind === "node" && !box.labelVisible) {
      return `${box.id} label is not visible: ${box.labelVisibilityReason}`;
    }
  }
  return null;
}

function workflowGraphEvidenceTargetZoom(snapshot, evidence, options) {
  const minimumZoom = options.minimumZoom ?? 0.8;
  const availableWidth = evidence.rect.right - evidence.rect.left;
  const availableHeight = evidence.rect.bottom - evidence.rect.top;
  const boundsWidth = evidence.bounds.right - evidence.bounds.left;
  const boundsHeight = evidence.bounds.bottom - evidence.bounds.top;
  const scale = Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight);
  if (scale >= 1) {
    return snapshot.camera.zoom;
  }
  return Math.max(minimumZoom, Math.min(snapshot.camera.zoom, snapshot.camera.zoom * scale * 0.96));
}

function workflowGraphEvidenceCenterShift(evidence) {
  const boundsCenterX = (evidence.bounds.left + evidence.bounds.right) / 2;
  const boundsCenterY = (evidence.bounds.top + evidence.bounds.bottom) / 2;
  const rectCenterX = (evidence.rect.left + evidence.rect.right) / 2;
  const rectCenterY = (evidence.rect.top + evidence.rect.bottom) / 2;
  return {
    x: rectCenterX - boundsCenterX,
    y: rectCenterY - boundsCenterY,
  };
}

function unionEvidenceBoxes(boxes) {
  return boxes.reduce(
    (bounds, box) => ({
      bottom: Math.max(bounds.bottom, box.bottom),
      left: Math.min(bounds.left, box.left),
      right: Math.max(bounds.right, box.right),
      top: Math.min(bounds.top, box.top),
    }),
    {
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
    },
  );
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
  // Scope to the active workflow graph host via the driver. Stable toolbar slots are always
  // present, so a background pane can also expose the same testId; an unscoped document lookup
  // would observe the wrong toolbar instance.
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowToolbarButtonState", { testId }),
    predicate,
  );
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
