import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { clearTimeout, setTimeout as startTimer } from "node:timers";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { waitForBackendState, waitForState } from "./chat-workflow-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const workspaceChatReadCLICommandTimeoutMs = 15_000;
const workspaceChatReadMarkerText = "workflow hold for queue and steering";
const workspaceChatSendMarkerText = "workspace chat send through pane command";
const workspaceChatQueueMarkerText = "queued follow-up from active run";
const workspaceChatQueueSteerText = "workspace chat queue release";

export async function runWorkspaceChatReadWorkflow({
  appDataDir,
  backend,
  client,
  conversationId,
  workspaceId,
}) {
  const pane = await openTemporaryWorkspaceChatPane(backend, workspaceId, conversationId);
  try {
    await waitForWorkspaceChatPaneBinding(client, workspaceId, pane.paneId, conversationId);
    const read = await runSettaWorkspaceCommandJSON(appDataDir, [
      "chats",
      "read",
      pane.paneId,
      "--limit",
      "20",
    ]);
    validateWorkspaceChatReadCLIResult(read, {
      conversationId,
      markerText: workspaceChatReadMarkerText,
      paneId: pane.paneId,
      workspaceId,
    });
    const sent = await runWorkspaceChatSendCommand(appDataDir, pane.paneId);
    validateWorkspaceChatSendCLIResult(sent, {
      conversationId,
      markerText: workspaceChatSendMarkerText,
      paneId: pane.paneId,
      workspaceId,
    });
    await waitForWorkspaceChatSendCompletion(
      backend,
      workspaceId,
      conversationId,
      workspaceChatSendMarkerText,
    );
    await waitForState(
      client,
      "document.body.innerText",
      (text) =>
        typeof text === "string" &&
        text.includes(workspaceChatSendMarkerText) &&
        text.includes(`Scripted response: ${workspaceChatSendMarkerText}`),
    );
    const active = await runWorkspaceChatSendCommand(
      appDataDir,
      pane.paneId,
      workspaceChatReadMarkerText,
    );
    validateWorkspaceChatSendCLIResult(active, {
      conversationId,
      markerText: workspaceChatReadMarkerText,
      paneId: pane.paneId,
      workspaceId,
    });
    await waitForWorkspaceChatRunStatusByID(
      backend,
      workspaceId,
      conversationId,
      active.result.run.id,
      "running",
    );
    const queued = await runWorkspaceChatQueueCommand(appDataDir, pane.paneId);
    validateWorkspaceChatQueueCLIResult(queued, {
      conversationId,
      markerText: workspaceChatQueueMarkerText,
      paneId: pane.paneId,
      workspaceId,
    });
    await waitForState(
      client,
      "document.body.innerText",
      (text) =>
        typeof text === "string" &&
        text.includes(workspaceChatQueueMarkerText) &&
        text.includes("Queued"),
    );
    await backend.post("/chat/messages/steer", {
      conversationId,
      input: chatTextInput(workspaceChatQueueSteerText),
      workspaceId,
    });
    await waitForWorkspaceChatRunStatusByID(
      backend,
      workspaceId,
      conversationId,
      active.result.run.id,
      "completed",
    );
    await waitForWorkspaceChatRunStatusByID(
      backend,
      workspaceId,
      conversationId,
      queued.result.run.id,
      "completed",
    );
    await waitForState(
      client,
      "document.body.innerText",
      (text) =>
        typeof text === "string" &&
        text.includes(`Steered with ${workspaceChatQueueSteerText}.`) &&
        text.includes(`Queued response for ${workspaceChatQueueMarkerText}.`),
    );
  } finally {
    await closeTemporaryWorkspaceChatPane(backend, workspaceId, pane.paneId);
  }
}

async function openTemporaryWorkspaceChatPane(backend, workspaceId, conversationId) {
  const result = await backend.post("/workspaces/ui/panes/operation", {
    operation: {
      kind: "open_pane",
      open: {
        chatConfig: { conversationId },
        subtitle: "temporary workspace chat read pane",
        surfaceKind: "chat-dom",
        title: "Workspace Chat Read",
        tone: "cyan",
      },
      paneId: "",
    },
    workspaceId,
  });
  const paneId = result.operationResult?.paneId ?? "";
  const pane = result.layout?.panes?.find((candidate) => candidate.paneId === paneId);
  if (!validTemporaryChatPaneOpenResult(result, pane, paneId, conversationId)) {
    throw new Error(`workspace chat pane open failed: ${JSON.stringify(result)}`);
  }
  return pane;
}

function validTemporaryChatPaneOpenResult(result, pane, paneId, conversationId) {
  if (result.operationResult?.kind !== "open_pane") {
    return false;
  }
  if (paneId === "" || pane?.surfaceKind !== "chat-dom") {
    return false;
  }
  return pane.chatConfig?.conversationId === conversationId;
}

async function closeTemporaryWorkspaceChatPane(backend, workspaceId, paneId) {
  const result = await backend.post("/workspaces/ui/panes/operation", {
    operation: {
      close: { surfaceClose: "none" },
      kind: "close_pane",
      paneId,
    },
    workspaceId,
  });
  if (result.operationResult?.kind !== "close_pane" || result.operationResult?.paneId !== paneId) {
    throw new Error(`workspace chat pane close failed: ${JSON.stringify(result)}`);
  }
  await waitForBackendState(
    async () => backend.post("/workspaces/ui/panes/list", { workspaceId }),
    (candidate) =>
      candidate.layoutPresent && !candidate.panes?.some((pane) => pane.paneId === paneId),
  );
}

async function waitForWorkspaceChatPaneBinding(client, workspaceId, paneId, conversationId) {
  return waitForState(
    client,
    `(async () => {
      const result = await window.setta.workspace.listUIPanes(${JSON.stringify(workspaceId)});
      const pane = result.panes.find((candidate) => candidate.paneId === ${JSON.stringify(paneId)});
      return {
        conversationId: pane?.contentRefs?.chat?.conversationId ?? "",
        layoutPresent: Boolean(result.layoutPresent),
        paneId: pane?.paneId ?? "",
        readModes: pane?.readModes ?? [],
        surfaceKind: pane?.surfaceKind ?? "",
        writeModes: pane?.writeModes ?? [],
      };
    })()`,
    (state) =>
      state.layoutPresent &&
      state.paneId === paneId &&
      state.surfaceKind === "chat-dom" &&
      state.conversationId === conversationId &&
      state.readModes.includes("chat_state") &&
      state.writeModes.includes("chat_send") &&
      state.writeModes.includes("chat_queue"),
  );
}

function validateWorkspaceChatReadCLIResult(read, expected) {
  if (!workspaceChatReadTargetMatches(read, expected)) {
    throw new Error(`workspace chat read returned wrong target: ${JSON.stringify(read)}`);
  }
  if (!read.pane.readModes?.includes("chat_state")) {
    throw new Error(
      `workspace chat read pane did not advertise chat_state: ${JSON.stringify(read)}`,
    );
  }
  if (!JSON.stringify(read.page).includes(expected.markerText)) {
    throw new Error(`workspace chat read page missed marker text: ${JSON.stringify(read)}`);
  }
}

async function runWorkspaceChatSendCommand(appDataDir, paneId, text = workspaceChatSendMarkerText) {
  const inputPath = await writeWorkspaceChatInput(appDataDir, text);
  return runSettaWorkspaceCommandJSON(appDataDir, ["chats", "send", paneId, "--input", inputPath]);
}

async function runWorkspaceChatQueueCommand(appDataDir, paneId) {
  const inputPath = await writeWorkspaceChatInput(appDataDir, workspaceChatQueueMarkerText);
  return runSettaWorkspaceCommandJSON(appDataDir, ["chats", "queue", paneId, "--input", inputPath]);
}

async function writeWorkspaceChatInput(appDataDir, text) {
  const inputPath = join(appDataDir, "workspace-chat-input.json");
  await writeFile(
    inputPath,
    JSON.stringify(
      {
        parts: [
          {
            type: "text",
            text: {
              text,
              format: "plain",
            },
          },
        ],
      },
      null,
      2,
    ),
  );
  return inputPath;
}

function chatTextInput(text) {
  return {
    parts: [
      {
        type: "text",
        text: {
          text,
          format: "plain",
        },
      },
    ],
  };
}

function validateWorkspaceChatSendCLIResult(sent, expected) {
  if (!workspaceChatSendTargetMatches(sent, expected)) {
    throw new Error(`workspace chat send returned wrong target: ${JSON.stringify(sent)}`);
  }
  if (!sent.pane.writeModes?.includes("chat_send")) {
    throw new Error(
      `workspace chat send pane did not advertise chat_send: ${JSON.stringify(sent)}`,
    );
  }
  if (sent.result?.userMessage?.delivery !== "normal") {
    throw new Error(`workspace chat send user message was not normal: ${JSON.stringify(sent)}`);
  }
  if (!JSON.stringify(sent.result).includes(expected.markerText)) {
    throw new Error(`workspace chat send result missed marker text: ${JSON.stringify(sent)}`);
  }
}

function workspaceChatSendTargetMatches(sent, expected) {
  return (
    JSON.stringify(workspaceChatSendTarget(sent)) ===
    JSON.stringify(expectedChatSendTarget(expected))
  );
}

function workspaceChatSendTarget(sent) {
  return {
    conversationId: sent.conversationId,
    pageConversationId: workspaceChatSendPageConversationId(sent),
    paneId: workspaceChatSendPaneId(sent),
    resultConversationId: workspaceChatSendResultConversationId(sent),
    runConversationId: workspaceChatSendRunConversationId(sent),
    userMessageConversationId: workspaceChatSendUserMessageConversationId(sent),
    workspaceId: sent.workspaceId,
  };
}

function workspaceChatSendPageConversationId(sent) {
  return sent.result?.page?.conversation?.id;
}

function workspaceChatSendPaneId(sent) {
  return sent.pane?.paneId;
}

function workspaceChatSendResultConversationId(sent) {
  return sent.result?.conversation?.id;
}

function workspaceChatSendRunConversationId(sent) {
  return sent.result?.run?.conversationId;
}

function workspaceChatSendUserMessageConversationId(sent) {
  return sent.result?.userMessage?.conversationId;
}

function expectedChatSendTarget(expected) {
  return {
    conversationId: expected.conversationId,
    pageConversationId: expected.conversationId,
    paneId: expected.paneId,
    resultConversationId: expected.conversationId,
    runConversationId: expected.conversationId,
    userMessageConversationId: expected.conversationId,
    workspaceId: expected.workspaceId,
  };
}

function validateWorkspaceChatQueueCLIResult(queued, expected) {
  if (!workspaceChatQueueTargetMatches(queued, expected)) {
    throw new Error(`workspace chat queue returned wrong target: ${JSON.stringify(queued)}`);
  }
  if (!workspaceChatQueuePaneWriteModes(queued).includes("chat_queue")) {
    throw new Error(
      `workspace chat queue pane did not advertise chat_queue: ${JSON.stringify(queued)}`,
    );
  }
  if (workspaceChatQueueUserMessageDelivery(queued) !== "queued") {
    throw new Error(`workspace chat queue user message was not queued: ${JSON.stringify(queued)}`);
  }
  if (workspaceChatQueueRunStatus(queued) !== "queued") {
    throw new Error(`workspace chat queue run was not queued: ${JSON.stringify(queued)}`);
  }
  if (!JSON.stringify(queued.result).includes(expected.markerText)) {
    throw new Error(`workspace chat queue result missed marker text: ${JSON.stringify(queued)}`);
  }
}

function workspaceChatQueueTargetMatches(queued, expected) {
  return (
    JSON.stringify(workspaceChatQueueTarget(queued)) ===
    JSON.stringify(expectedChatQueueTarget(expected))
  );
}

function workspaceChatQueueTarget(queued) {
  return {
    conversationId: queued.conversationId,
    pageConversationId: workspaceChatQueuePageConversationId(queued),
    paneId: workspaceChatQueuePaneId(queued),
    resultConversationId: workspaceChatQueueResultConversationId(queued),
    runConversationId: workspaceChatQueueRunConversationId(queued),
    userMessageConversationId: workspaceChatQueueUserMessageConversationId(queued),
    workspaceId: queued.workspaceId,
  };
}

function workspaceChatQueuePaneWriteModes(queued) {
  return queued.pane?.writeModes ?? [];
}

function workspaceChatQueueUserMessageDelivery(queued) {
  return queued.result?.userMessage?.delivery;
}

function workspaceChatQueueRunStatus(queued) {
  return queued.result?.run?.status;
}

function workspaceChatQueuePageConversationId(queued) {
  return queued.result?.page?.conversation?.id;
}

function workspaceChatQueuePaneId(queued) {
  return queued.pane?.paneId;
}

function workspaceChatQueueResultConversationId(queued) {
  return queued.result?.conversation?.id;
}

function workspaceChatQueueRunConversationId(queued) {
  return queued.result?.run?.conversationId;
}

function workspaceChatQueueUserMessageConversationId(queued) {
  return queued.result?.userMessage?.conversationId;
}

function expectedChatQueueTarget(expected) {
  return {
    conversationId: expected.conversationId,
    pageConversationId: expected.conversationId,
    paneId: expected.paneId,
    resultConversationId: expected.conversationId,
    runConversationId: expected.conversationId,
    userMessageConversationId: expected.conversationId,
    workspaceId: expected.workspaceId,
  };
}

async function waitForWorkspaceChatSendCompletion(backend, workspaceId, conversationId, prompt) {
  return waitForBackendState(
    async () => backend.post("/chat/runs/list", { conversationId, workspaceId }),
    (candidate) =>
      candidate.runs?.some(
        (run) =>
          run.conversationId === conversationId &&
          run.promptSummary === prompt &&
          run.status === "completed",
      ),
  );
}

async function waitForWorkspaceChatRunStatusByID(
  backend,
  workspaceId,
  conversationId,
  runId,
  status,
) {
  return waitForBackendState(
    async () => backend.post("/chat/runs/list", { conversationId, workspaceId }),
    (candidate) =>
      candidate.runs?.some(
        (run) =>
          run.id === runId &&
          run.workspaceId === workspaceId &&
          run.conversationId === conversationId &&
          run.status === status,
      ),
  );
}

function workspaceChatReadTargetMatches(read, expected) {
  return (
    JSON.stringify(workspaceChatReadTarget(read)) ===
    JSON.stringify(expectedChatReadTarget(expected))
  );
}

function workspaceChatReadTarget(read) {
  return {
    conversationId: read.conversationId,
    pageConversationId: read.page?.conversation?.id,
    pageWorkspaceId: read.page?.conversation?.workspaceId,
    paneId: read.pane?.paneId,
    workspaceId: read.workspaceId,
  };
}

function expectedChatReadTarget(expected) {
  return {
    conversationId: expected.conversationId,
    pageConversationId: expected.conversationId,
    pageWorkspaceId: expected.workspaceId,
    paneId: expected.paneId,
    workspaceId: expected.workspaceId,
  };
}

async function runSettaWorkspaceCommandJSON(appDataDir, args) {
  const result = await runSettaCommand([
    "workspace",
    ...workspaceCommandArgsWithAppDataDir(appDataDir, args),
  ]);
  if (result.status !== 0) {
    throw new Error(
      `setta workspace command failed: ${result.command}: status=${result.status} stdout=${result.stdout} stderr=${result.stderr}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`setta workspace command returned invalid JSON: ${result.command}: ${error}`, {
      cause: error,
    });
  }
}

function workspaceCommandArgsWithAppDataDir(appDataDir, args) {
  if (args[0] === "chats" && typeof args[1] === "string") {
    return ["chats", args[1], "--app-data-dir", appDataDir, ...args.slice(2)];
  }
  return [...args, "--app-data-dir", appDataDir];
}

function runSettaCommand(args) {
  const command = [join(repoRoot, "scripts/go.sh"), "run", "./cmd/setta", ...args];
  const child = spawn(command[0], command.slice(1), {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  return new Promise((resolvePromise, reject) => {
    const timeout = startTimer(() => {
      child.kill("SIGKILL");
      reject(new Error(`setta command timed out: ${command.join(" ")}`));
    }, workspaceChatReadCLICommandTimeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (status) => {
      clearTimeout(timeout);
      resolvePromise({
        command: command.join(" "),
        status: status ?? 1,
        stderr,
        stdout,
      });
    });
  });
}
