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
  await assertRunActivityItem(page, "file_change", (item) => item.title === "File change output");
  await assertRunActivityItem(page, "reasoning", (item) => item.hiddenText === "private reasoning");
  await assertRunActivityItem(
    page,
    "command_execution",
    (item) => item.processId === "process_fake",
  );

  const outputItem = page.items.find(
    (item) => item.type === "file_change" && item.title === "File change output",
  );
  if (!outputItem) {
    throw new Error(`file-change output item missing: ${JSON.stringify(page.items)}`);
  }
  const output = await backend.post("/chat/runs/item-output", {
    afterOrdinal: 0,
    limit: 20,
    runId,
    runItemId: outputItem.id,
    workspaceId,
  });
  if (
    !output.output.some((entry) => entry.stream === "patch" && entry.text.includes("diff --git"))
  ) {
    throw new Error(`file-change output missing patch stream: ${JSON.stringify(output)}`);
  }

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
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (line.trim() === "") {
    return;
  }
  const message = JSON.parse(line);
  handleMessage(message);
});

function handleMessage(message) {
  switch (message.method) {
    case "initialize":
      respond(message.id, {
        codexHome: "/tmp/codex",
        platformFamily: "unix",
        platformOs: "test",
        userAgent: "fake",
      });
      return;
    case "thread/start":
    case "thread/resume":
      respond(message.id, { model: "gpt-test", thread: { id: threadId } });
      return;
    case "turn/start":
      respond(message.id, { turn: { id: turnId } });
      setTimeout(emitProtocolCoverageTurn, 5);
      return;
    case "turn/interrupt":
      respond(message.id, {});
      return;
    case "model/list":
      respond(message.id, { models: [] });
      return;
    case "thread/goal/get":
      respond(message.id, { goal: null });
      return;
    case "thread/goal/set":
    case "thread/goal/clear":
    case "thread/settings/update":
      respond(message.id, {});
      return;
    default:
      respond(message.id, {});
  }
}

function respond(id, result) {
  write({ id, result });
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
  notify("item/fileChange/outputDelta", {
    delta: "diff --git a/main.go b/main.go\\n",
    itemId: "file_item_fake",
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
