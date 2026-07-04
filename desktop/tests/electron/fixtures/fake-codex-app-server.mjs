import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import readline from "node:readline";
import { setImmediate, setTimeout } from "node:timers";

const threadId = "thread_fake";
const turnId = "turn_fake";
const goalBackgroundTerminal = {
  command: "npm run goal-bg",
  idleGapOutput: "goal background idle output\n",
  itemId: "goal_bg_terminal",
  processId: "goal_bg_process",
  secondTurnOutput: "goal background turn B output\n",
};
const goalBackgroundTerminalFailure = {
  command: "npm run goal-bg-fail",
  exitCode: 1,
  idleGapOutput: "goal background failure output\n",
  itemId: "goal_bg_terminal_failed",
  processId: "goal_bg_process_failed",
  secondTurnOutput: "goal background failure final output\n",
};
const goalBackgroundTerminalCompletionDwellMs = 5000;
const goalForegroundUnifiedExec = {
  command: "command -v tokei",
  itemId: "goal_fg_command",
  processId: "goal_fg_process",
};
const statePath =
  process.env.SETTA_FAKE_CODEX_STATE_PATH ??
  (process.env.SETTA_APP_DATA_DIR
    ? join(process.env.SETTA_APP_DATA_DIR, "fake-codex-app-server-state.json")
    : "");
const unsupportedApprovalPolicySource =
  process.env.SETTA_FAKE_CODEX_UNSUPPORTED_APPROVAL_POLICY_SOURCE ?? "";
let account = null;
let activeSilentLivenessTurn = null;
let currentGoal = null;
let goalCancelTurnId = null;
let goalPaused = false;
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
  "configRequirements/read": handleConfigRequirementsRead,
  initialize: handleInitialize,
  initialized: () => {},
  "model/list": handleModelList,
  "thread/goal/clear": handleThreadGoalClear,
  "thread/goal/get": handleThreadGoalGet,
  "thread/goal/set": handleThreadGoalSet,
  "thread/read": handleThreadRead,
  "thread/resume": handleThreadResume,
  "thread/settings/update": respondEmpty,
  "thread/start": handleThreadStart,
  "turn/interrupt": handleTurnInterrupt,
  "turn/start": handleTurnStart,
  "turn/steer": handleTurnSteer,
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
  if (isStructuredThreadStart(message.params)) {
    assertStructuredThreadStart(message.params);
    respond(message.id, fakeThreadResponse({ ephemeral: true }));
    return;
  }
  assertThreadStartDeveloperInstructions(message.params);
  assertThreadStartDynamicTools(message.params);
  const options = threadResponseOptionsFromParams(message.params);
  applyUnsupportedApprovalPolicyForSource(options, "thread-start");
  respond(message.id, fakeThreadResponse(options));
}

function handleThreadResume(message) {
  if (message.params?.dynamicTools !== undefined) {
    throw new Error("thread/resume should not include dynamicTools");
  }
  const options = threadResponseOptionsFromParams(message.params);
  applyUnsupportedApprovalPolicyForSource(options, "thread-resume");
  respond(message.id, fakeThreadResponse(options));
}

function handleThreadRead(message) {
  if (message.params?.threadId !== threadId) {
    throw new Error(`unexpected thread/read threadId: ${message.params?.threadId}`);
  }
  respond(message.id, { thread: fakeThread({ activeTurn: activeTurnForThreadRead() }) });
}

function handleTurnStart(message) {
  respond(message.id, { turn: fakeTurn("inProgress") });
  if (isStructuredTurnStart(message.params)) {
    assertStructuredTurnStart(message.params);
    setTimeout(emitStructuredTaskTurn, 5);
    return;
  }
  const text = turnInputText(message);
  if (handleProviderLifecycleTurn(text)) {
    return;
  }
  if (text.includes("liveness reconciliation workflow")) {
    activeSilentLivenessTurn = fakeTurn("inProgress");
    setTimeout(emitSilentLivenessTurn, 5);
    return;
  }
  if (text.includes("liveness navigation workflow")) {
    activeSilentLivenessTurn = fakeTurn("inProgress");
    setTimeout(emitNavigationLivenessTurn, 5);
    return;
  }
  if (text.includes("current plan workflow")) {
    activeSilentLivenessTurn = fakeTurn("inProgress");
    setTimeout(emitCurrentPlanInitialTurn, 5);
    return;
  }
  if (text.includes("nonretryable stream error workflow")) {
    activeSilentLivenessTurn = fakeTurn("inProgress");
    setTimeout(emitNonRetryableStreamErrorTurn, 5);
    return;
  }
  if (text.includes("retryable stream error workflow")) {
    activeSilentLivenessTurn = fakeTurn("inProgress");
    setTimeout(emitRetryableStreamErrorTurn, 5);
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

function handleProviderLifecycleTurn(text) {
  if (text.includes("app-server exit workflow")) {
    emitRestartPartialTurn();
    writeFakeState({ activeRestartTurn: true });
    setTimeout(() => process.exit(42), 5);
    return true;
  }
  if (text.includes("malformed app-server lifecycle workflow")) {
    writeFakeState({ malformedProtocolPid: process.pid });
    setTimeout(emitMalformedProtocolAndStayAlive, 5);
    return true;
  }
  return false;
}

function fakeThreadResponse(options = {}) {
  const response = {
    approvalPolicy: options.approvalPolicy ?? "on-request",
    approvalsReviewer: "user",
    cwd: "/tmp/setta-fake",
    model: "gpt-test",
    modelProvider: "fake",
    sandbox: "workspace-write",
    thread: fakeThread(options),
  };
  if (options.permissionProfileId) {
    response.activePermissionProfile = { id: options.permissionProfileId };
  }
  return response;
}

function threadResponseOptionsFromParams(params) {
  const options = {};
  if (typeof params?.approvalPolicy === "string") {
    options.approvalPolicy = params.approvalPolicy;
  }
  if (typeof params?.permissions === "string" && params.permissions !== "") {
    options.permissionProfileId = params.permissions;
  }
  return options;
}

function fakeThread(options = {}) {
  const ephemeral = options.ephemeral === true;
  const activeTurn = options.activeTurn ?? null;
  return {
    cliVersion: "fake",
    createdAt: 1,
    cwd: "/tmp/setta-fake",
    ephemeral,
    id: threadId,
    modelProvider: "fake",
    path: ephemeral ? undefined : "/tmp/codex/thread_fake.json",
    preview: "",
    sessionId: "session_fake",
    source: "user",
    status: activeTurn === null ? { type: "idle" } : { activeFlags: [], type: "active" },
    turns: activeTurn === null ? [] : [activeTurn],
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

function activeTurnForThreadRead() {
  if (activeSilentLivenessTurn !== null) {
    return activeSilentLivenessTurn;
  }
  const state = readFakeState();
  return state.activeRestartTurn === true ? fakeTurn("inProgress") : null;
}

function readFakeState() {
  if (statePath === "" || !existsSync(statePath)) {
    return {};
  }
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function writeFakeState(state) {
  if (statePath === "") {
    return;
  }
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state), "utf8");
}

function applyUnsupportedApprovalPolicyForSource(options, source) {
  const policy = unsupportedApprovalPolicyForSource(source, options.approvalPolicy ?? "on-request");
  if (policy !== "on-request") {
    options.approvalPolicy = policy;
  }
}

function unsupportedApprovalPolicyForSource(source, fallback) {
  if (unsupportedApprovalPolicySource === source) {
    return "on-failure";
  }
  if (
    unsupportedApprovalPolicySource === `${source}-once` &&
    markUnsupportedApprovalPolicyUsed(source)
  ) {
    return "on-failure";
  }
  return fallback;
}

function markUnsupportedApprovalPolicyUsed(source) {
  const key = `unsupportedApprovalPolicy:${source}`;
  const state = readFakeState();
  if (state[key] === true) {
    return false;
  }
  state[key] = true;
  writeFakeState(state);
  return true;
}

function handleConfigRead(message) {
  respond(message.id, {
    config: {
      approval_policy: unsupportedApprovalPolicyForSource("config-read", "on-request"),
      model: "gpt-test",
      model_reasoning_effort: "xhigh",
    },
    layers: [],
    origins: {},
  });
}

function handleConfigRequirementsRead(message) {
  respond(message.id, {
    requirements: null,
  });
}

function handleModelList(message) {
  respond(message.id, {
    data: [
      {
        defaultReasoningEffort: "xhigh",
        description: "Fake protocol model.",
        displayName: "GPT Test",
        hidden: false,
        id: "gpt-test",
        inputModalities: ["text", "image"],
        isDefault: true,
        model: "gpt-test",
        supportedReasoningEfforts: [
          { description: "Fast responses with lighter reasoning.", reasoningEffort: "low" },
          { description: "Greater reasoning depth for complex problems.", reasoningEffort: "high" },
          {
            description: "Extra high reasoning depth for complex problems.",
            reasoningEffort: "xhigh",
          },
        ],
      },
    ],
    nextCursor: null,
  });
}

function handleThreadGoalGet(message) {
  respond(message.id, { goal: currentGoal });
}

function handleThreadGoalClear(message) {
  currentGoal = null;
  goalCancelTurnId = null;
  goalPaused = false;
  notify("thread/goal/cleared", { threadId });
  respond(message.id, { cleared: true });
}

function handleThreadGoalSet(message) {
  const { objective, status } = threadGoalSetValues(message.params);
  currentGoal = fakeGoal(objective, status);
  respond(message.id, {
    goal: currentGoal,
  });
  if (status === "paused") {
    goalPaused = true;
    notify("thread/goal/updated", { goal: currentGoal, threadId });
    return;
  }
  if (shouldEmitGoalOperation(objective, status)) {
    setTimeout(() => emitGoalOperationMultiTurn(objective), 5);
    return;
  }
  if (shouldEmitGoalForegroundUnifiedExec(objective, status)) {
    setTimeout(() => emitGoalOperationForegroundUnifiedExec(objective), 5);
    return;
  }
  if (shouldEmitGoalBackgroundTerminal(objective, status)) {
    setTimeout(() => emitGoalOperationBackgroundTerminal(objective), 5);
    return;
  }
  if (shouldEmitGoalCancellation(objective, status)) {
    setTimeout(() => emitGoalOperationCancellation(objective), 5);
  }
}

function threadGoalSetValues(params) {
  return {
    objective: params?.objective ?? currentGoal?.objective ?? "",
    status: params?.status ?? currentGoal?.status ?? "active",
  };
}

function shouldEmitGoalOperation(objective, status) {
  return objective === "phase0 codex multi turn" && status === "active";
}

function shouldEmitGoalBackgroundTerminal(objective, status) {
  return (
    (objective === "phase5 codex background terminal" ||
      objective === "phase5 codex background terminal failure") &&
    status === "active"
  );
}

function shouldEmitGoalForegroundUnifiedExec(objective, status) {
  return objective === "phase5 codex foreground command" && status === "active";
}

function shouldEmitGoalCancellation(objective, status) {
  return objective === "phase4 codex cancel" && status === "active";
}

function fakeGoal(objective, status) {
  return {
    createdAt: currentGoal?.createdAt ?? 1,
    objective,
    status,
    threadId,
    timeUsedSeconds: currentGoal?.timeUsedSeconds ?? 0,
    tokenBudget: null,
    tokensUsed: currentGoal?.tokensUsed ?? 0,
    updatedAt: currentGoal?.updatedAt === 2 ? 3 : 2,
  };
}

function respondEmpty(message) {
  respond(message.id, {});
}

function handleTurnInterrupt(message) {
  if (handleGoalTurnInterrupt(message)) {
    return;
  }
  if (handleSilentLivenessInterrupt(message)) {
    return;
  }
  if (handleRestartLivenessInterrupt(message)) {
    return;
  }
  respond(message.id, {});
}

function handleTurnSteer(message) {
  if (handleCurrentPlanSteer(message)) {
    return;
  }
  if (handleNavigationLivenessSteer(message)) {
    return;
  }
  respond(message.id, {});
}

function handleGoalTurnInterrupt(message) {
  if (currentGoal?.objective !== "phase4 codex cancel") {
    return false;
  }
  if (!goalPaused) {
    respondError(message.id, -32600, "goal pause is required before interrupt");
    return true;
  }
  if (message.params?.turnId !== goalCancelTurnId) {
    respondError(message.id, -32600, `unexpected goal cancellation turn ${message.params?.turnId}`);
    return true;
  }
  respond(message.id, {});
  notify("turn/completed", {
    threadId,
    turn: fakeTurnWithID(goalCancelTurnId, "interrupted"),
  });
  return true;
}

function handleSilentLivenessInterrupt(message) {
  if (activeSilentLivenessTurn?.id !== message.params?.turnId) {
    return false;
  }
  activeSilentLivenessTurn = null;
  respond(message.id, {});
  notify("turn/completed", {
    threadId,
    turn: fakeTurn("interrupted"),
  });
  return true;
}

function handleRestartLivenessInterrupt(message) {
  if (message.params?.turnId !== turnId) {
    return false;
  }
  if (readFakeState().activeRestartTurn !== true) {
    return false;
  }
  writeFakeState({ activeRestartTurn: false });
  respond(message.id, {});
  notify("turn/completed", {
    threadId,
    turn: fakeTurn("interrupted"),
  });
  return true;
}

function handleNavigationLivenessSteer(message) {
  if (activeSilentLivenessTurn?.id !== message.params?.expectedTurnId) {
    return false;
  }
  const text = turnInputText(message);
  if (!text.includes("finish liveness navigation workflow")) {
    return false;
  }
  activeSilentLivenessTurn = null;
  respond(message.id, {});
  notify("item/agentMessage/delta", {
    delta: "Navigation liveness complete. ",
    itemId: "navigation_liveness_message_fake",
    threadId,
    turnId,
  });
  notify("turn/completed", {
    threadId,
    turn: fakeTurn("completed"),
  });
  return true;
}

function handleCurrentPlanSteer(message) {
  if (activeSilentLivenessTurn?.id !== message.params?.expectedTurnId) {
    return false;
  }
  const text = turnInputText(message);
  if (text.includes("complete current plan workflow")) {
    activeSilentLivenessTurn = null;
    respond(message.id, {});
    notifyCurrentPlanUpdate({
      explanation: "Plan completed for the current turn.",
      steps: [
        { status: "completed", step: "Read the plan" },
        { status: "completed", step: "Render the active surface" },
        { status: "completed", step: "Verify the active surface update" },
      ],
    });
    notify("item/agentMessage/delta", {
      delta: "Current plan complete. ",
      itemId: "current_plan_message_fake",
      threadId,
      turnId,
    });
    notify("turn/completed", {
      threadId,
      turn: fakeTurn("completed"),
    });
    return true;
  }
  if (!text.includes("update current plan workflow")) {
    return false;
  }
  respond(message.id, {});
  notifyCurrentPlanUpdate({
    explanation: "Plan updated while the turn is active.",
    steps: [
      { status: "completed", step: "Read the plan" },
      { status: "completed", step: "Render the active surface" },
      { status: "inProgress", step: "Verify the active surface update" },
    ],
  });
  notify("item/agentMessage/delta", {
    delta: "Current plan updated. ",
    itemId: "current_plan_message_fake",
    threadId,
    turnId,
  });
  return true;
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

function isStructuredThreadStart(params) {
  return params?.ephemeral === true && params?.approvalPolicy === "never";
}

function assertStructuredThreadStart(params) {
  if (params?.sandbox !== "read-only") {
    throw new Error("structured thread/start should use read-only sandbox");
  }
  if (params?.dynamicTools !== undefined) {
    throw new Error("structured thread/start should not include dynamicTools");
  }
  const instructions = params?.developerInstructions;
  if (
    typeof instructions !== "string" ||
    !instructions.includes("strict JSON semantic graph patch envelope")
  ) {
    throw new Error("structured thread/start missing semantic cartographer prompt");
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

function isStructuredTurnStart(params) {
  return params?.approvalPolicy === "never" && params?.outputSchema !== undefined;
}

function assertStructuredTurnStart(params) {
  if (params?.sandboxPolicy === undefined) {
    throw new Error("structured turn/start missing sandboxPolicy");
  }
  if (params?.threadId !== threadId) {
    throw new Error("structured turn/start targeted wrong thread");
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

function respondError(id, code, message) {
  write({ error: { code, message }, id });
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
    summary: "Protocol deprecation notice.",
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
    changes: [
      {
        diff: "--- a/main.go\n+++ b/main.go\n@@\n+updated\n",
        kind: { type: "update" },
        path: "/tmp/workspace/main.go",
      },
    ],
    itemId: "file_item_fake",
    threadId,
    turnId,
  });
  notify("turn/diff/updated", {
    diff: "--- a/main.go\n+++ b/main.go\n@@\n-old\n+updated\n",
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
  emitMcpToolCallCoverage();
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

function emitMalformedProtocolAndStayAlive() {
  process.stdout.write("{not-json\n");
  const payload =
    JSON.stringify({
      method: "thread/settings/updated",
      params: { threadId },
    }) + "\n";
  writeMalformedProtocolNoise(payload);
}

function writeMalformedProtocolNoise(payload) {
  if (!process.stdout.write(payload)) {
    process.stdout.once("drain", () => writeMalformedProtocolNoise(payload));
    return;
  }
  setImmediate(() => writeMalformedProtocolNoise(payload));
}

function emitSilentLivenessTurn() {
  notify("item/agentMessage/delta", {
    delta: "Liveness stream started. ",
    itemId: "liveness_message_fake",
    threadId,
    turnId,
  });
}

function emitNavigationLivenessTurn() {
  notify("item/agentMessage/delta", {
    delta: "Navigation liveness started. ",
    itemId: "navigation_liveness_message_fake",
    threadId,
    turnId,
  });
}

function emitCurrentPlanInitialTurn() {
  notifyCurrentPlanUpdate({
    explanation: "Planning the current active turn.",
    steps: [
      { status: "completed", step: "Read the plan" },
      { status: "inProgress", step: "Render the active surface" },
      { status: "pending", step: "Verify the active surface update" },
    ],
  });
  notify("item/agentMessage/delta", {
    delta: "Current plan started. ",
    itemId: "current_plan_message_fake",
    threadId,
    turnId,
  });
}

function notifyCurrentPlanUpdate({ explanation, steps, turnID = turnId }) {
  notify("turn/plan/updated", {
    explanation,
    plan: steps.map((step) => ({
      status: step.status,
      step: step.step,
    })),
    summary: "legacy summary that must not be used",
    threadId,
    turnId: turnID,
  });
}

function emitRetryableStreamErrorTurn() {
  notify("item/agentMessage/delta", {
    delta: "Retryable stream started. ",
    itemId: "retryable_stream_message_fake",
    threadId,
    turnId,
  });
  emitStreamErrorNotification("Codex connection retrying", true);
}

function emitNonRetryableStreamErrorTurn() {
  notify("item/agentMessage/delta", {
    delta: "Partial before stream loss. ",
    itemId: "nonretryable_stream_message_fake",
    threadId,
    turnId,
  });
  emitStreamErrorNotification("stream disconnected before completion", false);
}

function emitStreamErrorNotification(message, willRetry) {
  notify("error", {
    error: {
      additionalDetails: "fake response stream disconnect",
      codexErrorInfo: {
        responseStreamDisconnected: {
          httpStatusCode: null,
        },
      },
      message,
    },
    threadId,
    turnId,
    willRetry,
  });
}

function emitRestartPartialTurn() {
  notify("item/agentMessage/delta", {
    delta: "Partial before provider restart. ",
    itemId: "provider_restart_message_fake",
    threadId,
    turnId,
  });
}

function emitMcpToolCallCoverage() {
  notify("item/started", {
    item: {
      appContext: { connectorId: "github", resourceUri: "mcp://github/repo" },
      arguments: { query: "setta" },
      id: "mcp_structured_fake",
      mcpAppResourceUri: "mcp://github/legacy",
      pluginId: "plugin_github",
      server: "github",
      status: "inProgress",
      tool: "search",
      type: "mcpToolCall",
    },
    startedAtMs: 1,
    threadId,
    turnId,
  });
  notify("item/mcpToolCall/progress", {
    itemId: "mcp_structured_fake",
    message: "Fetching repository data",
    threadId,
    turnId,
  });
  notify("item/completed", {
    completedAtMs: 2,
    item: {
      appContext: { connectorId: "github", resourceUri: "mcp://github/repo" },
      arguments: { query: "setta" },
      durationMs: 18,
      id: "mcp_structured_fake",
      mcpAppResourceUri: "mcp://github/legacy",
      pluginId: "plugin_github",
      result: {
        _meta: { traceId: "mcp_trace" },
        content: [
          { text: "Found repository data", type: "text" },
          { mimeType: "image/png", type: "image" },
        ],
        structuredContent: { repositories: 1 },
      },
      server: "github",
      status: "completed",
      tool: "search",
      type: "mcpToolCall",
    },
    threadId,
    turnId,
  });
  notify("item/completed", {
    completedAtMs: 3,
    item: {
      arguments: { query: "broken" },
      error: { message: "MCP tool failed" },
      id: "mcp_failed_fake",
      server: "github",
      status: "failed",
      tool: "broken_search",
      type: "mcpToolCall",
    },
    threadId,
    turnId,
  });
}

function emitStructuredTaskTurn() {
  notify("turn/completed", {
    threadId,
    turn: {
      ...fakeTurn("completed"),
      items: [
        {
          id: "structured_message_fake",
          text: '{"patches":[]}',
          type: "agentMessage",
        },
      ],
    },
  });
}

function emitGoalOperationMultiTurn(objective) {
  notify("thread/goal/updated", { goal: fakeGoal(objective, "active"), threadId });
  notify("turn/started", {
    threadId,
    turn: fakeTurnWithID("turn_goal_a", "inProgress"),
  });
  notify("item/agentMessage/delta", {
    delta: "Goal turn A. ",
    itemId: "goal_message_a",
    threadId,
    turnId: "turn_goal_a",
  });
  notify("turn/completed", {
    threadId,
    turn: fakeTurnWithID("turn_goal_a", "completed"),
  });
  notify("turn/started", {
    threadId,
    turn: fakeTurnWithID("turn_goal_b", "inProgress"),
  });
  notify("item/agentMessage/delta", {
    delta: "Goal turn B. ",
    itemId: "goal_message_b",
    threadId,
    turnId: "turn_goal_b",
  });
  currentGoal = fakeGoal(objective, "complete");
  notify("thread/goal/updated", { goal: currentGoal, threadId });
  notify("turn/completed", {
    threadId,
    turn: fakeTurnWithID("turn_goal_b", "completed"),
  });
}

function emitGoalOperationBackgroundTerminal(objective) {
  const execution = goalBackgroundTerminalExecution(objective);
  notify("thread/goal/updated", { goal: fakeGoal(objective, "active"), threadId });
  notify("turn/started", {
    threadId,
    turn: fakeTurnWithID("turn_goal_a", "inProgress"),
  });
  notify("item/agentMessage/delta", {
    delta: "Goal turn A. ",
    itemId: "goal_message_a",
    threadId,
    turnId: "turn_goal_a",
  });
  notifyGoalBackgroundTerminalStarted("turn_goal_a", execution);
  setTimeout(() => {
    notify("turn/completed", {
      threadId,
      turn: fakeTurnWithID("turn_goal_a", "completed"),
    });
    notifyGoalBackgroundTerminalOutput("turn_goal_a", execution, execution.idleGapOutput);
    notify("turn/started", {
      threadId,
      turn: fakeTurnWithID("turn_goal_b", "inProgress"),
    });
    notify("item/agentMessage/delta", {
      delta: "Goal turn B. ",
      itemId: "goal_message_b",
      threadId,
      turnId: "turn_goal_b",
    });
    notifyCurrentPlanUpdate({
      explanation: "Coordinating active work surfaces during the goal turn.",
      steps: [
        { status: "completed", step: "Start the background terminal" },
        { status: "inProgress", step: "Watch the background terminal" },
        { status: "pending", step: "Finish the goal turn" },
      ],
      turnID: "turn_goal_b",
    });
    setTimeout(() => {
      notifyGoalBackgroundTerminalOutput("turn_goal_a", execution, execution.secondTurnOutput);
      notifyGoalBackgroundTerminalCompleted("turn_goal_a", execution);
      currentGoal = fakeGoal(objective, "complete");
      notify("thread/goal/updated", { goal: currentGoal, threadId });
      notify("turn/completed", {
        threadId,
        turn: fakeTurnWithID("turn_goal_b", "completed"),
      });
    }, goalBackgroundTerminalCompletionDwellMs);
  }, 350);
}

function goalBackgroundTerminalExecution(objective) {
  return objective === "phase5 codex background terminal failure"
    ? goalBackgroundTerminalFailure
    : goalBackgroundTerminal;
}

function emitGoalOperationForegroundUnifiedExec(objective) {
  const turnId = "turn_goal_foreground";
  notify("thread/goal/updated", { goal: fakeGoal(objective, "active"), threadId });
  notify("turn/started", {
    threadId,
    turn: fakeTurnWithID(turnId, "inProgress"),
  });
  notify("item/agentMessage/delta", {
    delta: "Checking available tools. ",
    itemId: "goal_foreground_message",
    threadId,
    turnId,
  });
  notifyUnifiedExecStarted(turnId, goalForegroundUnifiedExec);
  notifyUnifiedExecOutput(turnId, goalForegroundUnifiedExec, "/opt/homebrew/bin/tokei\n");
  notifyUnifiedExecCompleted(turnId, goalForegroundUnifiedExec);
  currentGoal = fakeGoal(objective, "complete");
  notify("thread/goal/updated", { goal: currentGoal, threadId });
  notify("turn/completed", {
    threadId,
    turn: fakeTurnWithID(turnId, "completed"),
  });
}

function emitGoalOperationCancellation(objective) {
  goalPaused = false;
  notify("thread/goal/updated", { goal: fakeGoal(objective, "active"), threadId });
  notify("turn/started", {
    threadId,
    turn: fakeTurnWithID("turn_goal_cancel_a", "inProgress"),
  });
  notify("item/agentMessage/delta", {
    delta: "Goal cancel turn A. ",
    itemId: "goal_cancel_message_a",
    threadId,
    turnId: "turn_goal_cancel_a",
  });
  notify("turn/completed", {
    threadId,
    turn: fakeTurnWithID("turn_goal_cancel_a", "completed"),
  });
  goalCancelTurnId = "turn_goal_cancel_b";
  notify("turn/started", {
    threadId,
    turn: fakeTurnWithID(goalCancelTurnId, "inProgress"),
  });
  notify("item/agentMessage/delta", {
    delta: "Goal cancel waiting. ",
    itemId: "goal_cancel_message_b",
    threadId,
    turnId: goalCancelTurnId,
  });
}

function notifyGoalBackgroundTerminalStarted(turnID, execution) {
  notifyUnifiedExecStarted(turnID, execution);
}

function notifyGoalBackgroundTerminalOutput(turnID, execution, delta) {
  notifyUnifiedExecOutput(turnID, execution, delta);
}

function notifyGoalBackgroundTerminalCompleted(turnID, execution) {
  notifyUnifiedExecCompleted(turnID, execution);
}

function notifyUnifiedExecStarted(turnID, execution) {
  notify("item/started", {
    item: {
      command: execution.command,
      commandActions: [],
      cwd: "/tmp/workspace",
      id: execution.itemId,
      processId: execution.processId,
      source: "unifiedExecStartup",
      status: "inProgress",
      type: "commandExecution",
    },
    startedAtMs: 1,
    threadId,
    turnId: turnID,
  });
}

function notifyUnifiedExecOutput(turnID, execution, delta) {
  notify("item/commandExecution/outputDelta", {
    delta,
    itemId: execution.itemId,
    threadId,
    turnId: turnID,
  });
}

function notifyUnifiedExecCompleted(turnID, execution) {
  notify("item/completed", {
    completedAtMs: 3,
    item: {
      command: execution.command,
      commandActions: [],
      cwd: "/tmp/workspace",
      durationMs: 5,
      exitCode: execution.exitCode ?? 0,
      id: execution.itemId,
      processId: execution.processId,
      source: "unifiedExecStartup",
      status: "completed",
      type: "commandExecution",
    },
    threadId,
    turnId: turnID,
  });
}

function fakeTurnWithID(id, status) {
  return {
    ...fakeTurn(status),
    id,
  };
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
