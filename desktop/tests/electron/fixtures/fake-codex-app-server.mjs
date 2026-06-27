import { Buffer } from "node:buffer";
import process from "node:process";
import readline from "node:readline";
import { setTimeout } from "node:timers";

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
  const handler = methodHandlers[message.method] ?? respondEmpty;
  handler(message);
}

const methodHandlers = {
  "account/login/cancel": handleAccountLoginCancel,
  "account/login/start": handleAccountLoginStart,
  "account/logout": handleAccountLogout,
  "account/read": handleAccountRead,
  "config/read": handleConfigRead,
  initialize: handleInitialize,
  initialized: () => {},
  "model/list": handleModelList,
  "thread/goal/clear": respondEmpty,
  "thread/goal/get": handleThreadGoalGet,
  "thread/goal/set": handleThreadGoalSet,
  "thread/resume": handleThreadResume,
  "thread/settings/update": respondEmpty,
  "thread/start": handleThreadStart,
  "turn/interrupt": respondEmpty,
  "turn/start": handleTurnStart,
};

function handleInitialize(message) {
  respond(message.id, {
    codexHome: "/tmp/codex",
    platformFamily: "unix",
    platformOs: "test",
    userAgent: "fake",
  });
}

function handleAccountRead(message) {
  respond(message.id, {
    account,
    requiresOpenaiAuth: true,
  });
}

function handleAccountLoginCancel(message) {
  respond(message.id, {});
  notify("account/login/completed", {
    error: "cancelled",
    loginId: message.params?.loginId ?? "login_fake",
    success: false,
  });
}

function handleAccountLogout(message) {
  account = null;
  respond(message.id, {});
  notify("account/updated", { authMode: null, planType: null });
}

function handleThreadStart(message) {
  assertThreadStartDeveloperInstructions(message.params);
  assertThreadStartDynamicTools(message.params);
  respond(message.id, fakeThreadResponse());
}

function handleThreadResume(message) {
  if (message.params?.dynamicTools !== undefined) {
    throw new Error("thread/resume should not include dynamicTools");
  }
  respond(message.id, fakeThreadResponse());
}

function handleTurnStart(message) {
  respond(message.id, { turn: fakeTurn("inProgress") });
  const text = turnInputText(message);
  if (text.includes("app-server exit workflow")) {
    setTimeout(() => process.exit(42), 5);
    return;
  }
  if (text.includes("protocol notification workflow")) {
    setTimeout(
      () => requestDynamicTool("workspace_context", "tool_context", "workspace_context"),
      5,
    );
    return;
  }
  setTimeout(emitProtocolCoverageTurn, 5);
}

function fakeThreadResponse() {
  return {
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    cwd: "/tmp/setta-fake",
    model: "gpt-test",
    modelProvider: "fake",
    sandbox: "workspace-write",
    thread: fakeThread(),
  };
}

function fakeThread() {
  return {
    cliVersion: "fake",
    createdAt: 1,
    cwd: "/tmp/setta-fake",
    ephemeral: true,
    id: threadId,
    modelProvider: "fake",
    preview: "",
    sessionId: "session_fake",
    source: "user",
    status: { type: "idle" },
    turns: [],
    updatedAt: 1,
  };
}

function fakeTurn(status) {
  return {
    id: turnId,
    items: [],
    status,
  };
}

function handleConfigRead(message) {
  respond(message.id, {
    config: { model: "gpt-test", model_reasoning_effort: "xhigh" },
    layers: [],
    origins: {},
  });
}

function handleModelList(message) {
  respond(message.id, { data: [], nextCursor: null });
}

function handleThreadGoalGet(message) {
  respond(message.id, { goal: null });
}

function handleThreadGoalSet(message) {
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
}

function respondEmpty(message) {
  respond(message.id, {});
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
  const workspaceContext = workspaceContextTool(params);
  assertWorkspaceContextVisibility(workspaceContext);
  assertWorkspaceContextDescription(workspaceContext);
  assertWorkspaceContextInputSchema(workspaceContext);
}

function workspaceContextTool(params) {
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
  return workspaceContext;
}

function assertWorkspaceContextVisibility(workspaceContext) {
  if (workspaceContext.deferLoading !== undefined) {
    throw new Error("workspace_context should be visible");
  }
}

function assertWorkspaceContextDescription(workspaceContext) {
  if (
    typeof workspaceContext.description !== "string" ||
    !workspaceContext.description.includes("workspace")
  ) {
    throw new Error("workspace_context description missing workspace terms");
  }
}

function assertWorkspaceContextInputSchema(workspaceContext) {
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
  assertWorkspaceContextResult(message.result);
  assertWorkspaceContextContent(message.result.contentItems[0], message.result.contentItems);
}

function assertWorkspaceContextResult(result) {
  const items = result?.contentItems;
  if (result?.success !== true || !Array.isArray(items) || items.length !== 1) {
    throw new Error("workspace_context result mismatch: " + JSON.stringify(result));
  }
}

function assertWorkspaceContextContent(item, items) {
  const text = item?.text ?? "";
  if (item?.type !== "inputText" || !text.includes('"rootPath"') || !text.includes('"threadId"')) {
    throw new Error("workspace_context content mismatch: " + JSON.stringify(items));
  }
}

function assertUnsupportedDynamicToolResponse(message) {
  if (message.result) {
    throw new Error("unsupported dynamic tool unexpectedly returned result");
  }
  if (message.error?.code !== -32002) {
    throw new Error("unsupported dynamic tool error mismatch: " + JSON.stringify(message.error));
  }
  if (!message.error?.message?.includes("unsupported dynamic tool")) {
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
  return (message.params?.input ?? []).map((item) => item?.text ?? "").join("\n");
}

function notify(method, params) {
  write({ method, params });
}

function write(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function emitProtocolCoverageTurn() {
  notify("account/login/completed", { error: null, loginId: "login_fake", success: true });
  notify("app/list/updated", { data: [] });
  notify("command/exec/outputDelta", {
    capReached: false,
    deltaBase64: Buffer.from("command output\n").toString("base64"),
    processId: "process_fake",
    stream: "stdout",
  });
  notify("deprecationNotice", {
    details: "Use the replacement protocol surface.",
    summary: "Legacy protocol notice.",
  });
  notify("externalAgentConfig/import/completed", {});
  notify("fs/changed", { changedPaths: ["/tmp/workspace/main.go"], watchId: "watch_fake" });
  notify("fuzzyFileSearch/sessionUpdated", { files: [], query: "main", sessionId: "fuzzy_fake" });
  notify("fuzzyFileSearch/sessionCompleted", { sessionId: "fuzzy_fake" });
  notify("hook/started", hookPayload("running"));
  notify("hook/completed", hookPayload("completed"));
  notify("item/autoApprovalReview/started", autoApprovalReviewPayload("inProgress"));
  notify("item/autoApprovalReview/completed", autoApprovalReviewPayload("approved"));
  notify("item/started", contextCompactionPayload("context_compaction_fake", { startedAtMs: 1 }));
  notify(
    "item/completed",
    contextCompactionPayload("context_compaction_fake", { completedAtMs: 2 }),
  );
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
  notify("turn/moderationMetadata", {
    metadata: {
      presentation: "inline",
    },
    threadId,
    turnId,
  });
  notify("process/outputDelta", {
    capReached: false,
    deltaBase64: Buffer.from("process output\n").toString("base64"),
    processHandle: "process_fake",
    stream: "stdout",
  });
  notify("process/exited", {
    exitCode: 0,
    processHandle: "process_fake",
    stderr: "",
    stderrCapReached: false,
    stdout: "process done\n",
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
    turn: fakeTurn("completed"),
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

function contextCompactionPayload(itemId, timing) {
  return {
    ...timing,
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
