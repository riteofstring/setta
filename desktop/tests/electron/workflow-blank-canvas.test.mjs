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
  await waitForPixiSnapshot(context.client, (snapshot) => snapshot.graph.nodeCount === 0);
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

  await dispatchPixiContextMenu(context.client, pixiSurfaceId, { x: 360, y: 260 });
  await waitForSelector(context.client, '[data-testid="workflow-node-create-menu"]');
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

  const definitions = await workflowDefinitions(context.client, workspaceId);
  if (definitions.length !== 1 || definitions[0].name !== "Untitled workflow") {
    throw new Error(`workflow definitions after first edit = ${JSON.stringify(definitions)}`);
  }
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
