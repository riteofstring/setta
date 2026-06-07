/* global console */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  createElectronFixture,
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

  const menuPoint = await dispatchPixiContextMenu(context.client, pixiSurfaceId, {
    x: 360,
    y: 260,
  });
  await waitForSelector(context.client, '[data-testid="workflow-node-create-menu"]');
  await assertContextMenuAnchored(context.client, menuPoint);
  const selected = await context.client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="workflow-node-create-start"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-start-node-menu-item" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!selected.ok) {
    throw new Error(
      `failed to select start node from workflow context menu: ${JSON.stringify(selected)}`,
    );
  }
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

  const definitions = await workflowDefinitions(context.client, workspaceId);
  if (definitions.length !== 1 || definitions[0].name !== "Untitled workflow") {
    throw new Error(`workflow definitions after first edit = ${JSON.stringify(definitions)}`);
  }
  await assertSidebarWorkflowConversationSections(context.client);
  const saved = await readSavedWorkflowDefinition(fixture.workspaceRoot, definitions[0].id);
  if (saved.name !== "Untitled workflow" || saved.graph.nodes[0]?.kind !== "start") {
    throw new Error(`saved workflow definition mismatch: ${JSON.stringify(saved)}`);
  }
  if (saved.graph.layout.nodes[0]?.nodeId !== "start") {
    throw new Error(
      `saved workflow layout missing start node: ${JSON.stringify(saved.graph.layout)}`,
    );
  }

  await writeJson(join(artifactDir, "summary.json"), {
    definitionId: definitions[0].id,
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
