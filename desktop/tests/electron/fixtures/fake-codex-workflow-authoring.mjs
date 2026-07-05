import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

export const workflowAuthoring = {
  definitionName: "CLI Authored Workflow",
  messageId: "workflow_authoring_message",
  promptMarker: "workflow authoring CLI smoke",
};

export async function emitWorkflowAuthoringTurn(context) {
  context.notify("item/agentMessage/delta", {
    delta: "Using $workflow-builder with the setta workflow CLI. ",
    itemId: workflowAuthoring.messageId,
    threadId: context.threadId,
    turnId: context.turnId,
  });
  const currentWorkspace = await runWorkflowCLICommand(context, "current_workspace", [
    "workflow",
    "current-workspace",
  ]);
  assertWorkflowCurrentWorkspace(currentWorkspace);
  const schema = await runWorkflowCLICommand(context, "schema", ["workflow", "schema"], {
    output: "schema loaded\n",
  });
  assertWorkflowSchema(schema);

  const paths = writeWorkflowAuthoringInputs();
  const invalidValidation = await runWorkflowCLICommand(
    context,
    "validate_invalid",
    ["workflow", "definitions", "validate", "--graph", paths.invalidGraphPath],
    { output: "invalid graph returned end_node_required\n" },
  );
  assertInvalidWorkflowValidation(invalidValidation);
  const validValidation = await runWorkflowCLICommand(
    context,
    "validate_valid",
    ["workflow", "definitions", "validate", "--graph", paths.graphPath],
    { output: "valid graph accepted\n" },
  );
  assertValidWorkflowValidation(validValidation);
  const saveResult = await runWorkflowCLICommand(
    context,
    "save",
    ["workflow", "definitions", "save", "--input", paths.saveInputPath],
    { output: "workflow definition saved\n" },
  );
  const definition = savedWorkflowDefinition(saveResult);
  const listResult = await runWorkflowCLICommand(
    context,
    "list",
    ["workflow", "definitions", "list"],
    { output: "workflow definition listed\n" },
  );
  assertWorkflowDefinitionListed(listResult, definition.id);
  const execution = await runWorkflowCLICommand(
    context,
    "start",
    ["workflow", "executions", "start", definition.id],
    { output: "workflow execution started\n" },
  );
  assertWorkflowExecution(execution, definition.id);
  const readExecution = await runWorkflowCLICommand(
    context,
    "read_execution",
    ["workflow", "executions", "read", execution.id],
    { output: "workflow execution read\n" },
  );
  assertWorkflowExecutionRead(readExecution, execution.id, definition.id);
  context.notify("item/agentMessage/delta", {
    delta: `CLI-authored workflow saved and run. ${workflowAuthoring.definitionName}. `,
    itemId: workflowAuthoring.messageId,
    threadId: context.threadId,
    turnId: context.turnId,
  });
  context.notify("turn/completed", {
    threadId: context.threadId,
    turn: {
      ...context.fakeTurn("completed"),
      items: [
        {
          id: workflowAuthoring.messageId,
          text: `CLI-authored workflow saved and run. ${workflowAuthoring.definitionName}.`,
          type: "agentMessage",
        },
      ],
    },
  });
}

export function emitWorkflowAuthoringFailure(error, context) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`fake workflow authoring failed: ${message}\n`);
  context.notify("error", {
    error: {
      additionalDetails: message,
      message: "fake workflow authoring failed",
    },
    threadId: context.threadId,
    turnId: context.turnId,
    willRetry: false,
  });
  context.notify("turn/completed", {
    threadId: context.threadId,
    turn: {
      ...context.fakeTurn("failed"),
      items: [
        {
          id: workflowAuthoring.messageId,
          text: `Workflow authoring failed: ${message}`,
          type: "agentMessage",
        },
      ],
    },
  });
}

async function runWorkflowCLICommand(context, key, args, options = {}) {
  const execution = {
    command: ["setta", ...args].join(" "),
    itemId: `workflow_authoring_${key}`,
    processId: `workflow_authoring_${key}_process`,
  };
  context.notifyUnifiedExecStarted(context.turnId, execution);
  const result = await runSettaCommand(args);
  const output = options.output ?? commandVisibleOutput(result);
  if (output !== "") {
    context.notifyUnifiedExecOutput(context.turnId, execution, output);
  }
  context.notifyUnifiedExecCompleted(context.turnId, { ...execution, exitCode: result.status });
  if (result.status !== 0) {
    throw new Error(
      `${execution.command} exited ${result.status}: stdout=${result.stdout} stderr=${result.stderr}`,
    );
  }
  return parseCommandJSON(execution.command, result.stdout);
}

function runSettaCommand(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("setta", args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolvePromise({ signal, status: 1, stderr, stdout });
        return;
      }
      resolvePromise({ signal: null, status: code ?? 1, stderr, stdout });
    });
  });
}

function commandVisibleOutput(result) {
  return result.stdout === "" ? result.stderr : result.stdout;
}

function parseCommandJSON(command, stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parse ${command} JSON output: ${message}: ${stdout}`, { cause: error });
  }
}

function writeWorkflowAuthoringInputs() {
  const root = workflowAuthoringRoot();
  mkdirSync(root, { recursive: true });
  const graph = workflowAuthoringGraph();
  const invalidGraphPath = join(root, "invalid-graph.json");
  const graphPath = join(root, "graph.json");
  const saveInputPath = join(root, "save-input.json");
  writeJSONFile(invalidGraphPath, workflowAuthoringInvalidGraph());
  writeJSONFile(graphPath, graph);
  writeJSONFile(saveInputPath, {
    definitionId: "",
    description: "Created by deterministic in-app Codex workflow authoring coverage.",
    graph,
    name: workflowAuthoring.definitionName,
    operation: "create",
  });
  return { graphPath, invalidGraphPath, saveInputPath };
}

function workflowAuthoringRoot() {
  if (!process.env.SETTA_APP_DATA_DIR) {
    throw new Error("SETTA_APP_DATA_DIR is required for workflow authoring CLI coverage");
  }
  return join(process.env.SETTA_APP_DATA_DIR, "fake-codex-workflow-authoring");
}

function writeJSONFile(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function workflowAuthoringInvalidGraph() {
  return {
    agentDefaults: workflowAuthoringAgentDefaults(),
    edges: [],
    layout: { nodes: [{ nodeId: "start", x: 0, y: 0 }] },
    nodes: [
      {
        action: null,
        gateway: null,
        id: "start",
        kind: "start",
        loopGuard: null,
        title: "Start",
      },
    ],
  };
}

function workflowAuthoringGraph() {
  return {
    agentDefaults: workflowAuthoringAgentDefaults(),
    edges: [
      {
        condition: null,
        fromNodeId: "start",
        id: "start_end",
        kind: "normal",
        toNodeId: "end",
      },
    ],
    layout: {
      nodes: [
        { nodeId: "start", x: -180, y: 0 },
        { nodeId: "end", x: 180, y: 0 },
      ],
    },
    nodes: [
      {
        action: null,
        gateway: null,
        id: "start",
        kind: "start",
        loopGuard: null,
        title: "Start",
      },
      {
        action: null,
        gateway: null,
        id: "end",
        kind: "end",
        loopGuard: null,
        title: "End",
      },
    ],
  };
}

function workflowAuthoringAgentDefaults() {
  return { model: "", permission: null, reasoningEffort: null };
}

function assertWorkflowCurrentWorkspace(value) {
  if (typeof value?.id !== "string" || value.id === "" || typeof value.rootPath !== "string") {
    throw new Error(`workflow current-workspace output mismatch: ${JSON.stringify(value)}`);
  }
}

function assertWorkflowSchema(value) {
  if (
    value?.schemaVersion !== 1 ||
    value.graphType !== "WorkflowGraph" ||
    !Array.isArray(value.valueSets) ||
    !Array.isArray(value.actions)
  ) {
    throw new Error(`workflow schema output mismatch: ${JSON.stringify(value)}`);
  }
}

function assertInvalidWorkflowValidation(value) {
  if (
    value?.valid !== false ||
    !workflowDiagnosticsContain(value.diagnostics, "end_node_required")
  ) {
    throw new Error(`invalid workflow diagnostics mismatch: ${JSON.stringify(value)}`);
  }
}

function assertValidWorkflowValidation(value) {
  if (value?.valid !== true || !Array.isArray(value.diagnostics)) {
    throw new Error(`valid workflow diagnostics mismatch: ${JSON.stringify(value)}`);
  }
}

function savedWorkflowDefinition(saveResult) {
  const definition = saveResult?.definition;
  if (!workflowSaveResultMatches(saveResult, definition)) {
    throw new Error(`workflow save result mismatch: ${JSON.stringify(saveResult)}`);
  }
  return definition;
}

function workflowSaveResultMatches(saveResult, definition) {
  return (
    saveResult?.operation === "create" &&
    saveResult.saved === true &&
    saveResult.validation?.valid === true &&
    workflowDefinitionMatches(definition)
  );
}

function workflowDefinitionMatches(definition) {
  return (
    definition?.name === workflowAuthoring.definitionName &&
    typeof definition.id === "string" &&
    definition.id !== ""
  );
}

function assertWorkflowDefinitionListed(listResult, definitionId) {
  if (
    !Array.isArray(listResult?.definitions) ||
    !listResult.definitions.some(
      (definition) =>
        definition.id === definitionId && definition.name === workflowAuthoring.definitionName,
    )
  ) {
    throw new Error(`workflow definitions list mismatch: ${JSON.stringify(listResult)}`);
  }
}

function assertWorkflowExecution(execution, definitionId) {
  if (
    typeof execution?.id !== "string" ||
    execution.id === "" ||
    execution.definitionId !== definitionId
  ) {
    throw new Error(`workflow execution start output mismatch: ${JSON.stringify(execution)}`);
  }
}

function assertWorkflowExecutionRead(execution, executionId, definitionId) {
  if (execution?.id !== executionId || execution.definitionId !== definitionId) {
    throw new Error(`workflow execution read output mismatch: ${JSON.stringify(execution)}`);
  }
}

function workflowDiagnosticsContain(diagnostics, code) {
  return Array.isArray(diagnostics) && diagnostics.some((diagnostic) => diagnostic.code === code);
}
