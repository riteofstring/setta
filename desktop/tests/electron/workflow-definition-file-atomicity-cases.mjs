import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  appendWorkflowState,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopElectron,
} from "./chat-workflow-harness.mjs";

export async function runWorkflowDefinitionFileAtomicityWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("workflow-definition-file-atomicity");
  const recordingDir = join(recordingRoot, "workflow-definition-file-atomicity");
  const context = await launchContext(fixture, recordingDir);
  let failure = null;

  try {
    await runWorkflowDefinitionFileAtomicityScenario(context, fixture, recordingDir);
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    context.client?.close();
    await stopElectron(context.electron);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, context.electron.logs);
  }
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/conversations/list",
      "/workflows/definitions/create",
      "/workflows/definitions/update",
      "/workflows/definitions/list",
      "/workflows/definitions/read",
      "/workflows/graph/read",
    ],
    expectedIpcFailures: [isExpectedReloadShutdownRequest],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "workflow:create-definition",
      "workflow:update-definition",
      "workflow:list-definitions",
      "workflow:read-definition",
      "workflow:graph-projection",
    ],
  });
  results.push("workflow-definition-file-atomicity");
  process.stdout.write("Electron chat workflow passed: workflow-definition-file-atomicity\n");
}

async function runWorkflowDefinitionFileAtomicityScenario(context, fixture, recordingDir) {
  const backend = await backendProbe(recordingDir);
  const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
  await createChat(context.client, backend, workspaceId);
  const definition = await createWorkflowDefinition(context.client, workspaceId);
  const createdFile = await singleDefinitionFile(fixture.workspaceRoot, definition.id);
  const finalFile = await renameDefinitionTwiceAndAssertStableFiles(
    context.client,
    fixture.workspaceRoot,
    workspaceId,
    definition,
    createdFile,
  );

  await reloadRenderer(context.client);
  await assertReloadedWorkflowLoads(context.client, workspaceId, definition.id);
  await appendWorkflowState(recordingDir, {
    definitionId: definition.id,
    fileName: finalFile.fileName,
    type: "workflow_definition_file_atomicity_verified",
  });
}

async function createWorkflowDefinition(client, workspaceId) {
  return rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Atomic Rename",
    "Initial definition name.",
    startEndGraph(),
  ]);
}

async function renameDefinitionTwiceAndAssertStableFiles(
  client,
  workspaceRoot,
  workspaceId,
  definition,
  createdFile,
) {
  await renameDefinitionAndAssertStableFile(
    client,
    workspaceRoot,
    workspaceId,
    definition.id,
    createdFile,
    "Atomic Rename v2",
    "Renamed once.",
  );
  return renameDefinitionAndAssertStableFile(
    client,
    workspaceRoot,
    workspaceId,
    definition.id,
    createdFile,
    "Atomic Rename Final",
    "Renamed twice.",
  );
}

async function renameDefinitionAndAssertStableFile(
  client,
  workspaceRoot,
  workspaceId,
  definitionId,
  createdFile,
  name,
  description,
) {
  await rendererWorkflow(client, "updateDefinition", [
    workspaceId,
    definitionId,
    name,
    description,
    startEndGraph(),
  ]);
  const updatedFile = await singleDefinitionFile(workspaceRoot, definitionId);
  assertStableDefinitionFile(createdFile, updatedFile, name, description);
  return updatedFile;
}

async function assertReloadedWorkflowLoads(client, workspaceId, definitionId) {
  const definitionsResponse = await rendererWorkflow(client, "listDefinitions", [workspaceId]);
  const definitions = definitionsResponse.definitions;
  if (
    definitions.length !== 1 ||
    definitions[0].id !== definitionId ||
    definitions[0].name !== "Atomic Rename Final"
  ) {
    throw new Error(`definitions after reload = ${JSON.stringify(definitions)}`);
  }
  const read = await rendererWorkflow(client, "readDefinition", [workspaceId, definitionId]);
  if (read.name !== "Atomic Rename Final" || read.description !== "Renamed twice.") {
    throw new Error(`read definition after reload = ${JSON.stringify(read)}`);
  }
  const projectionResponse = await rendererWorkflow(client, "graphProjection", [
    workspaceId,
    definitionId,
    "",
    "",
  ]);
  const projection = projectionResponse.projection;
  if (
    projection.definitionId !== definitionId ||
    projection.definitionName !== "Atomic Rename Final" ||
    projection.viewMode !== "draft"
  ) {
    throw new Error(`graph projection after reload = ${JSON.stringify(projection)}`);
  }
}

function isExpectedReloadShutdownRequest(entry) {
  return entry.error?.message === "backend is stopping";
}

async function reloadRenderer(client) {
  await client.call("Page.reload", { ignoreCache: true });
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 20_000) {
    try {
      const ready = await client.evaluate(
        "Boolean(window.setta?.workflow?.listDefinitions && window.setta?.workflow?.graphProjection)",
      );
      if (ready) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`renderer workflow API did not recover after reload: ${lastError?.message}`);
}

function assertStableDefinitionFile(initial, actual, expectedName, expectedDescription) {
  if (actual.fileName !== initial.fileName) {
    throw new Error(
      `workflow definition file name changed from ${initial.fileName} to ${actual.fileName}`,
    );
  }
  if (
    actual.definition.name !== expectedName ||
    actual.definition.description !== expectedDescription
  ) {
    throw new Error(
      `workflow definition file payload = ${JSON.stringify(actual.definition)}, want ${expectedName}/${expectedDescription}`,
    );
  }
}

async function singleDefinitionFile(workspaceRoot, definitionId) {
  const workflowDir = join(workspaceRoot, ".setta", "workflows");
  const entries = await readdir(workflowDir);
  const matches = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const raw = await readFile(join(workflowDir, entry), "utf8");
    const definition = JSON.parse(raw);
    if (definition.id === definitionId) {
      matches.push({ definition, fileName: entry });
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `workflow definition ${definitionId} file matches = ${JSON.stringify(matches)} in ${JSON.stringify(entries)}`,
    );
  }
  return matches[0];
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

function startEndGraph() {
  return {
    edges: [{ fromNodeId: "start", id: "start_end", kind: "normal", toNodeId: "end" }],
    layout: {
      nodes: [
        { nodeId: "start", x: 0, y: 0 },
        { nodeId: "end", x: 260, y: 0 },
      ],
    },
    nodes: [
      { id: "start", kind: "start" },
      { id: "end", kind: "end" },
    ],
  };
}
