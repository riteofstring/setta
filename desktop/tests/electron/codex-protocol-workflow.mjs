import process from "node:process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function installFakeCodexAppServer(fixture) {
  const binDir = join(fixture.tempRoot, "fake-bin");
  await mkdir(binDir, { recursive: true });
  const scriptPath = join(binDir, "fake-codex-app-server.mjs");
  await writeFile(scriptPath, fakeCodexAppServerScript(), "utf8");
  if (process.platform === "win32") {
    const commandPath = join(binDir, "codex.cmd");
    await writeFile(commandPath, `@echo off\r\nnode "${scriptPath}" %*\r\n`, "utf8");
    return { binDir, commandPath };
  }
  const commandPath = join(binDir, "codex");
  await writeFile(commandPath, `#!/usr/bin/env sh\nexec node "${scriptPath}" "$@"\n`, "utf8");
  await chmod(commandPath, 0o755);
  return { binDir, commandPath };
}

export async function assertProtocolNotificationActivity(
  backend,
  workspaceId,
  conversationId,
  runId,
) {
  const page = await backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId });
  await assertRunActivityItem(page, "hook", (item) => item.title === "Hook: pre-command");
  await assertRunActivityItem(page, "approval_review", (item) => item.reviewId === "review_fake");
  await assertRunActivityItem(
    page,
    "context_compaction",
    (item) => item.title === "Context compaction" && item.status === "completed",
  );
  await assertRunActivityItem(
    page,
    "file_change",
    (item) => item.patchStatus === "updated" && item.filePaths.includes("/tmp/workspace/main.go"),
  );
  await assertRunActivityItem(page, "reasoning", (item) => item.hiddenText === "private reasoning");
  await assertRunActivityItem(
    page,
    "command_execution",
    (item) => item.processId === "process_fake",
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "completed" &&
      item.namespace === "setta" &&
      item.toolName === "workspace_context" &&
      item.result.includes("rootPath"),
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "failed" &&
      item.namespace === "setta" &&
      item.toolName === "missing_tool" &&
      item.error.includes("unsupported dynamic tool"),
  );

  const diagnostics = await backend.post("/chat/diagnostics/list", {
    conversationId,
    runId,
    workspaceId,
  });
  const warningCodes = diagnostics.diagnostics.map((diagnostic) => diagnostic.code);
  if (
    !warningCodes.includes("codex_windows_world_writable_warning") ||
    !warningCodes.includes("codex_realtime_notification_ignored")
  ) {
    throw new Error(
      `protocol diagnostics missing expected warnings: ${JSON.stringify(diagnostics)}`,
    );
  }
}

async function assertRunActivityItem(page, type, matches) {
  const item = page.items.find((candidate) => candidate.type === type && matches(candidate));
  if (!item) {
    throw new Error(`run activity missing ${type}: ${JSON.stringify(page.items)}`);
  }
  return item;
}

function fakeCodexAppServerScript() {
  return `import readline from "node:readline";

const threadId = "thread_fake";
const turnId = "turn_fake";
let account = null;
let pendingDynamicTool = null;
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (line.trim() === "") {
    return;
  }
  const message = JSON.parse(line);
  handleMessage(message);
});

function handleMessage(message) {
  if (pendingDynamicTool && message.method === undefined) {
    handleDynamicToolResponse(message);
    return;
  }
  switch (message.method) {
    case "initialize":
      respond(message.id, {
        codexHome: "/tmp/codex",
        platformFamily: "unix",
        platformOs: "test",
        userAgent: "fake",
      });
      return;
    case "initialized":
      return;
    case "account/read":
      respond(message.id, {
        account,
        requiresOpenaiAuth: true,
      });
      return;
    case "account/login/start":
      handleAccountLoginStart(message);
      return;
    case "account/login/cancel":
      respond(message.id, {});
      notify("account/login/completed", {
        error: "cancelled",
        loginId: message.params?.loginId ?? "login_fake",
        success: false,
      });
      return;
    case "account/logout":
      account = null;
      respond(message.id, {});
      notify("account/updated", { authMode: null, planType: null });
      return;
    case "thread/start":
      assertThreadStartDeveloperInstructions(message.params);
      assertThreadStartDynamicTools(message.params);
      respond(message.id, { model: "gpt-test", thread: { id: threadId } });
      return;
    case "thread/resume":
      if (message.params?.dynamicTools !== undefined) {
        throw new Error("thread/resume should not include dynamicTools");
      }
      respond(message.id, { model: "gpt-test", thread: { id: threadId } });
      return;
    case "turn/start":
      respond(message.id, { turn: { id: turnId } });
      if (turnInputText(message).includes("app-server exit workflow")) {
        setTimeout(() => process.exit(42), 5);
        return;
      }
      if (turnInputText(message).includes("protocol notification workflow")) {
        setTimeout(() => requestDynamicTool("workspace_context", "tool_context", "workspace_context"), 5);
        return;
      }
      setTimeout(emitProtocolCoverageTurn, 5);
      return;
    case "config/read":
      respond(message.id, {
        config: { model: "gpt-test", model_reasoning_effort: "xhigh" },
        layers: [],
        origins: {},
      });
      return;
    case "turn/interrupt":
      respond(message.id, {});
      return;
    case "model/list":
      respond(message.id, { data: [], nextCursor: null });
      return;
    case "thread/goal/get":
      respond(message.id, { goal: null });
      return;
    case "thread/goal/set":
      respond(message.id, {
        goal: {
          createdAt: 0,
          objective: message.params?.objective ?? "",
          status: message.params?.status ?? "active",
          threadId,
          timeUsedSeconds: 0,
          tokenBudget: null,
          tokensUsed: 0,
          updatedAt: 0,
        },
      });
      return;
    case "thread/goal/clear":
    case "thread/settings/update":
      respond(message.id, {});
      return;
    default:
      respond(message.id, {});
  }
}

function assertThreadStartDeveloperInstructions(params) {
  const instructions = params?.developerInstructions;
  if (
    typeof instructions !== "string" ||
    !instructions.includes("available dynamic tool") ||
    !instructions.includes("Do not invent dynamic tool names")
  ) {
    throw new Error("thread/start developerInstructions missing Setta dynamic tool guidance");
  }
}

function assertThreadStartDynamicTools(params) {
  const tools = params?.dynamicTools;
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error("thread/start missing dynamicTools");
  }
  const workspaceContext = tools.find(
    (tool) => tool?.namespace === "setta" && tool?.name === "workspace_context",
  );
  if (!workspaceContext) {
    throw new Error("thread/start missing setta.workspace_context dynamic tool");
  }
  if (workspaceContext.deferLoading !== undefined) {
    throw new Error("workspace_context should be visible");
  }
  if (
    typeof workspaceContext.description !== "string" ||
    !workspaceContext.description.includes("workspace")
  ) {
    throw new Error("workspace_context description missing workspace terms");
  }
  if (
    workspaceContext.inputSchema?.type !== "object" ||
    workspaceContext.inputSchema?.additionalProperties !== false
  ) {
    throw new Error("workspace_context input schema mismatch");
  }
}

function requestDynamicTool(tool, id, kind) {
  pendingDynamicTool = { id, kind };
  write({
    id,
    method: "item/tool/call",
    params: {
      arguments: {},
      callId: id + "_call",
      namespace: "setta",
      threadId,
      tool,
      turnId,
    },
  });
}

function handleDynamicToolResponse(message) {
  const pending = pendingDynamicTool;
  pendingDynamicTool = null;
  if (message.id !== pending.id) {
    throw new Error("dynamic tool response id mismatch");
  }
  if (pending.kind === "workspace_context") {
    assertWorkspaceContextToolResponse(message);
    requestDynamicTool("missing_tool", "tool_missing", "missing_tool");
    return;
  }
  if (pending.kind === "missing_tool") {
    assertUnsupportedDynamicToolResponse(message);
    emitProtocolCoverageTurn();
    return;
  }
  throw new Error("unknown pending dynamic tool kind: " + pending.kind);
}

function assertWorkspaceContextToolResponse(message) {
  if (message.error) {
    throw new Error("workspace_context returned error: " + JSON.stringify(message.error));
  }
  const items = message.result?.contentItems;
  if (message.result?.success !== true || !Array.isArray(items) || items.length !== 1) {
    throw new Error("workspace_context result mismatch: " + JSON.stringify(message.result));
  }
  const text = items[0]?.text ?? "";
  if (items[0]?.type !== "inputText" || !text.includes('"rootPath"') || !text.includes('"threadId"')) {
    throw new Error("workspace_context content mismatch: " + JSON.stringify(items));
  }
}

function assertUnsupportedDynamicToolResponse(message) {
  if (message.result) {
    throw new Error("unsupported dynamic tool unexpectedly returned result");
  }
  if (message.error?.code !== -32002 || !message.error?.message?.includes("unsupported dynamic tool")) {
    throw new Error("unsupported dynamic tool error mismatch: " + JSON.stringify(message.error));
  }
}

function handleAccountLoginStart(message) {
  const type = message.params?.type;
  if (type === "apiKey") {
    account = { type: "apiKey" };
    respond(message.id, { type: "apiKey" });
    notify("account/login/completed", { error: null, loginId: null, success: true });
    notify("account/updated", { authMode: "apikey", planType: null });
    return;
  }
  if (type === "chatgptDeviceCode") {
    respond(message.id, {
      loginId: "login_device_fake",
      type: "chatgptDeviceCode",
      userCode: "ABCD-1234",
      verificationUrl: "https://auth.openai.com/codex/device",
    });
    return;
  }
  account = { email: "user@example.com", planType: "pro", type: "chatgpt" };
  respond(message.id, {
    authUrl: "https://chatgpt.com/auth/fake",
    loginId: "login_fake",
    type: "chatgpt",
  });
  setTimeout(() => {
    notify("account/login/completed", { error: null, loginId: "login_fake", success: true });
    notify("account/updated", { authMode: "chatgpt", planType: "pro" });
  }, 5);
}

function respond(id, result) {
  write({ id, result });
}

function turnInputText(message) {
  return (message.params?.input ?? [])
    .map((item) => item?.text ?? "")
    .join("\\n");
}

function notify(method, params) {
  write({ method, params });
}

function write(payload) {
  process.stdout.write(JSON.stringify(payload) + "\\n");
}

function emitProtocolCoverageTurn() {
  notify("account/login/completed", { error: null, loginId: "login_fake", success: true });
  notify("app/list/updated", { data: [] });
  notify("command/exec/outputDelta", {
    capReached: false,
    deltaBase64: Buffer.from("command output\\n").toString("base64"),
    processId: "process_fake",
    stream: "stdout",
  });
  notify("externalAgentConfig/import/completed", {});
  notify("fs/changed", { changedPaths: ["/tmp/workspace/main.go"], watchId: "watch_fake" });
  notify("fuzzyFileSearch/sessionUpdated", { files: [], query: "main", sessionId: "fuzzy_fake" });
  notify("fuzzyFileSearch/sessionCompleted", { sessionId: "fuzzy_fake" });
  notify("hook/started", hookPayload("running"));
  notify("hook/completed", hookPayload("completed"));
  notify("item/autoApprovalReview/started", autoApprovalReviewPayload("inProgress"));
  notify("item/autoApprovalReview/completed", autoApprovalReviewPayload("approved"));
  notify("item/started", contextCompactionPayload("context_compaction_fake"));
  notify("item/completed", contextCompactionPayload("context_compaction_fake"));
  notify("item/fileChange/patchUpdated", {
    changedPaths: ["/tmp/workspace/main.go"],
    itemId: "file_item_fake",
    status: "updated",
    threadId,
    turnId,
  });
  notify("item/reasoning/textDelta", {
    contentIndex: 0,
    delta: "private reasoning",
    itemId: "reasoning_item_fake",
    threadId,
    turnId,
  });
  notify("mcpServer/oauthLogin/completed", { error: null, name: "github", success: true });
  notify("model/verification", {
    threadId,
    turnId,
    verifications: ["trustedAccessForCyber"],
  });
  notify("process/outputDelta", {
    capReached: false,
    deltaBase64: Buffer.from("process output\\n").toString("base64"),
    processHandle: "process_fake",
    stream: "stdout",
  });
  notify("process/exited", {
    exitCode: 0,
    processHandle: "process_fake",
    stderr: "",
    stderrCapReached: false,
    stdout: "process done\\n",
    stdoutCapReached: false,
  });
  notify("serverRequest/resolved", { requestId: "unknown_request", threadId });
  notify("skills/changed", {});
  emitRealtimeNotifications();
  notify("windows/worldWritableWarning", {
    extraCount: 0,
    failedScan: false,
    samplePaths: ["C:/tmp/world-writable"],
  });
  notify("windowsSandbox/setupCompleted", { error: null, mode: "unelevated", success: true });
  notify("item/agentMessage/delta", {
    delta: "coverage complete",
    itemId: "message_fake",
    threadId,
    turnId,
  });
  notify("turn/completed", {
    threadId,
    turn: { id: turnId, items: [], status: "completed" },
  });
}

function hookPayload(status) {
  return {
    run: {
      command: "printf hook",
      durationMs: status === "completed" ? 12 : 0,
      eventName: "pre-command",
      id: "hook_fake",
      status,
      statusMessage: status,
    },
    threadId,
    turnId,
  };
}

function autoApprovalReviewPayload(status) {
  return {
    action: { command: "pwd", type: "command" },
    review: { status },
    reviewId: "review_fake",
    threadId,
    turnId,
  };
}

function contextCompactionPayload(itemId) {
  return {
    item: { id: itemId, type: "contextCompaction" },
    threadId,
    turnId,
  };
}

function emitRealtimeNotifications() {
  notify("thread/realtime/started", { realtimeSessionId: "realtime_fake", threadId, version: 1 });
  notify("thread/realtime/itemAdded", { item: { id: "item_fake" }, threadId });
  notify("thread/realtime/transcript/delta", { delta: "hi", role: "user", threadId });
  notify("thread/realtime/transcript/done", { role: "user", text: "hi", threadId });
  notify("thread/realtime/outputAudio/delta", { audio: { data: "AAAA" }, threadId });
  notify("thread/realtime/sdp", { sdp: "v=0", threadId });
  notify("thread/realtime/error", { message: "disabled", threadId });
  notify("thread/realtime/closed", { reason: null, threadId });
}
`;
}
