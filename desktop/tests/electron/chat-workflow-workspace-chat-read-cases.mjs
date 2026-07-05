import { spawn } from "node:child_process";
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
      };
    })()`,
    (state) =>
      state.layoutPresent &&
      state.paneId === paneId &&
      state.surfaceKind === "chat-dom" &&
      state.conversationId === conversationId &&
      state.readModes.includes("chat_state"),
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
