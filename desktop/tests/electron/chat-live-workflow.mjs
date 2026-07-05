import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { assertNoCriticalDiagnostics } from "./chat-workflow-assertions.mjs";
import { pasteImageIntoComposer } from "./chat-workflow-image-attachment-cases.mjs";
import { prepareLiveCodexAuth } from "./chat-live-auth.mjs";

// 128px PNG with red/green/blue/yellow quadrants; lower-right is yellow.
const liveQuadrantImagePNGBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAABaElEQVR4nO3RQQ0CAQDEQEyAA04MNpCGHSTgAAe8EHGPTZNJqqBz+RxHutvrke4yPwhgPxFAuPlBAPuJAMIBAAAg3fwggP1EAOEAAACQbn4QwH4igHAAAABINz8IYD8RQDgAAACkmx8EsJ8IIBwAAADSzQ8C2E8EEA4AAADp5gcB7CcCCAcAAIB084MA9hMBhAMAAEC6+UEA+4kAwgEAACDd/CCA/UQA4QAAAJBufhDAfiKAcAAAAEg3PwhgPxFAOAAAAKSbHzwLcH9+0/3e13QAAABINz8IYD8RQDgAAACkmx8EsJ8IIBwAAADSzQ8C2E8EEA4AAADp5gcB7CcCCAcAAIB084MA9hMBhAMAAEC6+UEA+4kAwgEAACDd/CCA/UQA4QAAAJBufhDAfiKAcAAAAEg3PwhgPxFAOAAAAKSbHwSwnwggHAAAANLNDwLYTwQQDgAAAOnmBwHsJwIIBwAAgHTzgyf7A1y/lRpPEmWaAAAAAElFTkSuQmCC";

export async function runLiveCodexWorkflow(results, deps) {
  const {
    assertAssistantCompleted,
    assertNoActiveRun,
    assertNoVisibleUserMessage,
    assertRecordingEvidence,
    backendProbe,
    captureScreenshot,
    createChat,
    createFixture,
    failureWithLogs,
    launchContext,
    liveWorkflowTimeoutMs,
    openWorkspace,
    recordingRoot,
    repoRoot,
    stopElectron,
    submitComposer,
    waitForAssistantTextRendered,
    waitForBackendState,
    waitForCommandResult,
    waitForGoalStatus,
    waitForLinkedCodexRef,
    waitForRunStatus,
    waitForRunWithPrompt,
    waitForState,
    waitForTexts,
  } = deps;

  const liveAuth = await prepareLiveCodexAuth(repoRoot);
  if (!liveAuth.available) {
    results.push("live-codex-electron-skipped-no-chatgpt-auth");
    process.stdout.write(
      `Electron chat workflow skipped: live-codex-electron (${liveAuth.reason})\n`,
    );
    return;
  }
  const fixture = await createFixture("live-codex");
  const recordingDir = join(recordingRoot, "live-codex");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: liveAuth.env,
    harness: "codex",
    unsetEnv: liveAuth.unsetEnv,
  });
  let failure = null;
  let imageSmokeRan = false;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    const conversationId = await createChat(context.client, backend, workspaceId);
    const liveGoalPrompt =
      "Run the shell command `pwd`, then reply with one short sentence containing the exact phrase setta live goal smoke.";
    await submitComposer(context.client, `/goal ${liveGoalPrompt}`, "Send message");
    await waitForCommandResult(
      backend,
      workspaceId,
      conversationId,
      `Goal set: ${liveGoalPrompt}`,
      liveWorkflowTimeoutMs,
    );
    await waitForTexts(context.client, [`Goal set: ${liveGoalPrompt}`]);
    await waitForLinkedCodexRef(backend, workspaceId, conversationId, liveWorkflowTimeoutMs);
    const goalRun = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      liveGoalPrompt,
      null,
    );
    await waitForRunStatus(backend, workspaceId, conversationId, goalRun.id, {
      status: "completed",
      timeoutMs: liveWorkflowTimeoutMs,
    });
    await assertAssistantCompleted(backend, workspaceId, conversationId, goalRun.id);
    await waitForGoalStatus(
      backend,
      workspaceId,
      conversationId,
      "complete",
      liveWorkflowTimeoutMs,
    );
    await waitForTexts(context.client, ["setta live goal smoke"]);
    await waitForTexts(context.client, ["Goal complete"]);
    await assertLiveGoalForegroundCommandsStayActivity({
      backend,
      client: context.client,
      conversationId,
      runId: goalRun.id,
      timeoutMs: liveWorkflowTimeoutMs,
      waitForBackendState,
      workspaceId,
    });
    await assertNoVisibleUserMessage(context.client, liveGoalPrompt);
    await submitComposer(context.client, "/goal clear", "Send message");
    await waitForCommandResult(
      backend,
      workspaceId,
      conversationId,
      "Goal cleared.",
      liveWorkflowTimeoutMs,
    );
    await waitForGoalStatus(backend, workspaceId, conversationId, null, liveWorkflowTimeoutMs);
    await submitComposer(
      context.client,
      "Reply with one short sentence containing the exact phrase setta live electron smoke.",
      "Send message",
    );
    const run = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "Reply with one short sentence containing the exact phrase setta live electron smoke.",
      null,
    );
    await waitForRunStatus(backend, workspaceId, conversationId, run.id, {
      status: "completed",
      timeoutMs: liveWorkflowTimeoutMs,
    });
    await assertNoActiveRun(backend, workspaceId, conversationId);
    await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
    await waitForAssistantTextRendered(context.client, liveWorkflowTimeoutMs);
    await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
    imageSmokeRan = await runLiveImageAttachmentWorkflow({
      assertAssistantCompleted,
      assertNoActiveRun,
      backend,
      client: context.client,
      conversationId,
      liveWorkflowTimeoutMs,
      submitComposer,
      waitForRunStatus,
      waitForRunWithPrompt,
      waitForState,
      waitForTexts,
      workspaceId,
    });
    await runLiveSemanticCartographerWorkflow({
      client: context.client,
      timeoutMs: liveWorkflowTimeoutMs,
      waitForBackendState,
      workspaceId,
    });
    await captureScreenshot(context.client, join(recordingDir, "success.png"));
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
  const imageAttachmentEvidence = imageSmokeRan
    ? {
        backendPaths: ["/chat/attachments/images/from-bytes"],
        ipcChannels: ["chat:create-image-attachment-from-bytes"],
      }
    : { backendPaths: [], ipcChannels: [] };
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      ...imageAttachmentEvidence.backendPaths,
      "/chat/messages/send",
      "/chat/messages/page",
      "/chat/runs/active",
      "/chat/runs/activity",
      "/chat/runs/list",
      "/chat/background-terminals/list",
      "/chat/diagnostics/list",
      "/chat/commands/execute",
      "/workflows/definitions/validate",
      "/workflows/definitions/create",
      "/workflows/executions/start",
      "/workflows/executions/read",
      "/semantic-graph/nodes/create",
      "/semantic-graph/attachments/workflow-node",
      "/semantic-graph/cartographer/processing/state",
      "/semantic-graph/cartographer/runs/list",
      "/semantic-graph/cartographer/windows/list",
      "/semantic-graph/cartographer/patches/list",
      "/semantic-graph/read",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      ...imageAttachmentEvidence.ipcChannels,
      "chat:send-message",
      "chat:execute-command",
      "workflow:validate-definition",
      "workflow:create-definition",
      "workflow:start-execution",
      "workflow:read-execution",
      "semantic-graph:create-node",
      "semantic-graph:attach-workflow-node",
      "semantic-graph:cartographer-processing-state",
      "semantic-graph:cartographer-run-list",
      "semantic-graph:cartographer-window-list",
      "semantic-graph:cartographer-patch-list",
      "semantic-graph:read",
    ],
  });
  results.push("live-codex-electron");
  process.stdout.write("Electron chat workflow passed: live-codex-electron\n");
}

async function runLiveImageAttachmentWorkflow({
  assertAssistantCompleted,
  assertNoActiveRun,
  backend,
  client,
  conversationId,
  liveWorkflowTimeoutMs,
  submitComposer,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForState,
  waitForTexts,
  workspaceId,
}) {
  if (!(await liveImageAttachmentSupported({ backend, conversationId, workspaceId }))) {
    process.stdout.write(
      "Electron chat workflow skipped: live-codex-image-attachment (selected model does not support images)\n",
    );
    return false;
  }

  const prompt =
    "Name the attached image lower-right color and include exact phrase setta live image attachment smoke.";
  await pasteImageIntoComposer(client, waitForState, "live-image.png", liveQuadrantImagePNGBase64);
  await submitComposer(client, prompt, "Send message");
  const run = await waitForRunWithPrompt(backend, workspaceId, conversationId, prompt, null);
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, {
    status: "completed",
    timeoutMs: liveWorkflowTimeoutMs,
  });
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
  await waitForTexts(client, ["setta live image attachment smoke"]);

  const page = await backend.post("/chat/messages/page", {
    beforeBlockOrdinal: 0,
    conversationId,
    limit: 30,
    workspaceId,
  });
  assertLiveImageUserMessage(page, run.id);
  assertLiveImageAssistantText(page, run.id);

  return true;
}

async function liveImageAttachmentSupported({ backend, conversationId, workspaceId }) {
  const initialPage = await backend.post("/chat/messages/page", {
    beforeBlockOrdinal: 0,
    conversationId,
    limit: 20,
    workspaceId,
  });
  return initialPage.conversation.codexEffectiveSettings?.supportsImages !== false;
}

function assertLiveImageUserMessage(page, runId) {
  const userMessage = page.messages.find(
    (message) =>
      message.role === "user" &&
      message.runId === runId &&
      message.parts.some((part) => part.type === "image"),
  );
  if (!userMessage) {
    throw new Error(`live image user message was not persisted: ${JSON.stringify(page.messages)}`);
  }
  const imagePart = userMessage.parts.find((part) => part.type === "image")?.image;
  if (!imagePart || imagePart.fileName !== "live-image.png" || !hasLiveImageVariants(imagePart)) {
    throw new Error(`live image part metadata was not persisted: ${JSON.stringify(imagePart)}`);
  }
}

function hasLiveImageVariants(imagePart) {
  const variants = new Map((imagePart.variants ?? []).map((variant) => [variant.kind, variant]));
  for (const kind of ["thumbnail", "inline", "preview", "original"]) {
    const variant = variants.get(kind);
    if (
      !variant ||
      !variant.url.endsWith(`/${kind}`) ||
      variant.byteSize <= 0 ||
      variant.width <= 0 ||
      variant.height <= 0
    ) {
      return false;
    }
  }
  return true;
}

function assertLiveImageAssistantText(page, runId) {
  const assistantText = page.messages
    .find((message) => message.role === "assistant" && message.runId === runId)
    ?.parts.map((part) => part.text?.text ?? "")
    .join(" ");
  if (!assistantText || !/\byellow\b/i.test(assistantText)) {
    throw new Error(`live image assistant response did not identify yellow: ${assistantText}`);
  }
}

async function assertLiveGoalForegroundCommandsStayActivity({
  backend,
  client,
  conversationId,
  runId,
  timeoutMs,
  waitForBackendState,
  workspaceId,
}) {
  const activityPage = await waitForBackendState(
    async () => backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId }),
    (page) =>
      Array.isArray(page.items) &&
      page.items.some((item) => item.type === "command_execution" && item.status === "completed"),
    timeoutMs,
  );
  const commands = activityPage.items.filter((item) => item.type === "command_execution");
  if (commands.length === 0) {
    throw new Error(`live goal did not expose command activity: ${JSON.stringify(activityPage)}`);
  }

  const list = await backend.post("/chat/background-terminals/list", {
    conversationId,
    workspaceId,
  });
  if (Array.isArray(list.terminals) && list.terminals.length !== 0) {
    throw new Error(
      `live goal foreground command created background terminals: ${JSON.stringify(list)}`,
    );
  }

  const surface = await client.evaluate(`(() => ({
    footer: Boolean(document.querySelector('[data-testid="background-terminals-footer"]')),
    markers: Array.from(document.querySelectorAll('[data-testid="background-terminal-block"]')).map((el) => el.innerText),
    text: document.body.innerText,
  }))()`);
  if (
    surface.footer ||
    surface.markers.length !== 0 ||
    surface.text.includes("Started background terminal")
  ) {
    throw new Error(
      `live goal foreground command rendered background-terminal UI: ${JSON.stringify(surface)}`,
    );
  }
}

async function runLiveSemanticCartographerWorkflow({
  client,
  timeoutMs,
  waitForBackendState,
  workspaceId,
}) {
  const agentNodeId = "live_cartographer_agent";
  const seedNodeId = "semantic_live_cartographer_seed";
  const graph = workflowGraph(
    [
      workflowControlNode("start", "start"),
      workflowCodexNode(
        agentNodeId,
        'Recordable semantic finding. Reply with exactly one sentence: "Setta live semantic cartographer finding: a real workflow agent run produced evidence for automatic semantic graph creation."',
      ),
      workflowControlNode("end", "end"),
    ],
    [
      workflowEdge("start_agent", "start", agentNodeId),
      workflowEdge("agent_end", agentNodeId, "end"),
    ],
  );
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`live cartographer workflow invalid: ${JSON.stringify(validation)}`);
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Live semantic cartographer smoke",
    "Live workflow-agent run used to verify automatic cartographer processing.",
    graph,
  ]);
  await rendererSemanticGraph(client, "createNode", [
    {
      actorId: "live_cartographer_e2e",
      actorKind: "user",
      kind: "constraint",
      label: "Live semantic cartographer seed evidence",
      nodeId: seedNodeId,
      summary: "Evidence anchor for the live workflow-agent cartographer smoke.",
      workspaceId,
    },
  ]);
  await rendererSemanticGraph(client, "attachWorkflowNode", [
    {
      activityKind: "validating",
      actorId: "live_cartographer_e2e",
      actorKind: "user",
      nodeId: seedNodeId,
      summary: "Live workflow-agent evidence for automatic semantic graph creation.",
      workflowDefinitionId: definition.id,
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId: agentNodeId,
      workspaceId,
    },
  ]);
  const started = await rendererWorkflow(client, "startExecution", [workspaceId, definition.id]);
  const execution = await waitForBackendState(
    async () => rendererWorkflow(client, "readExecution", [workspaceId, started.id]),
    (value) => value.status === "completed",
    timeoutMs,
  );
  assertLiveWorkflowCompleted(execution);
  await waitForBackendState(
    async () => readLiveCartographerState(client, workspaceId, started.id),
    liveCartographerApplied,
    timeoutMs,
  );
}

async function readLiveCartographerState(client, workspaceId, executionId) {
  const [graph, patches, runs, state, windows] = await Promise.all([
    rendererSemanticGraph(client, "read", [{ workspaceId }]),
    rendererSemanticGraph(client, "listCartographerPatches", [
      {
        limit: 50,
        runId: "",
        semanticTargetId: "",
        status: "",
        workspaceId,
      },
    ]),
    rendererSemanticGraph(client, "listCartographerRuns", [
      {
        chatRunId: "",
        limit: 50,
        targetEntityId: "",
        workflowExecutionId: executionId,
        workspaceId,
      },
    ]),
    rendererSemanticGraph(client, "readCartographerProcessingState", [{}]),
    rendererSemanticGraph(client, "listCartographerWindows", [
      {
        chatRunId: "",
        limit: 50,
        runId: "",
        sourceId: "",
        sourceKind: "",
        workflowExecutionId: executionId,
        workspaceId,
      },
    ]),
  ]);
  return { graph, patches, runs, state, windows };
}

function liveCartographerApplied(value) {
  const appliedRun = value.runs.runs.find((run) => run.status === "applied");
  const appliedPatch = value.patches.patches.find(
    (patch) =>
      patch.runId === appliedRun?.id &&
      patch.status === "applied" &&
      patch.createdSemanticEventIds.length > 0,
  );
  return (
    value.state.enabled &&
    value.state.started &&
    value.windows.windows.some((window) => window.status === "processed") &&
    Boolean(appliedRun) &&
    Boolean(appliedPatch) &&
    value.graph.nodes.length > 1
  );
}

function assertLiveWorkflowCompleted(execution) {
  if (execution.status !== "completed" || execution.terminalReason !== "end_reached") {
    throw new Error(`live cartographer workflow did not complete: ${JSON.stringify(execution)}`);
  }
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function rendererSemanticGraph(client, method, args) {
  return client.evaluate(
    `window.setta.semanticGraph[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

function workflowGraph(nodes, edges) {
  return {
    edges,
    layout: {
      nodes: nodes.map((node, index) => ({
        nodeId: node.id,
        x: index * 260,
        y: 0,
      })),
    },
    nodes,
  };
}

function workflowControlNode(id, kind) {
  return {
    action: null,
    gateway: null,
    id,
    kind,
    loopGuard: null,
    title: id,
  };
}

function workflowCodexNode(id, prompt) {
  return {
    action: {
      codex: {
        freshConversation: true,
        model: "",
        prompt,
        reasoningEffort: "",
      },
      kind: "agent.codex",
    },
    gateway: null,
    id,
    kind: "action",
    loopGuard: null,
    title: id,
  };
}

function workflowEdge(id, fromNodeId, toNodeId) {
  return {
    condition: null,
    fromNodeId,
    id,
    kind: "normal",
    toNodeId,
  };
}
