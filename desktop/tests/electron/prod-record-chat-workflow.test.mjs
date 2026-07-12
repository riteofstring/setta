#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { CDPClient } from "./cdp-client.mjs";
import {
  assertRecordingEvidence,
  assertTextAbsent,
  backendProbe,
  captureScreenshot,
  clickButtonByAria,
  createChat,
  createFixture,
  failureWithLogs,
  openWorkspace,
  waitForTexts,
} from "./chat-workflow-harness.mjs";
import { assertAskForApprovalPermissionContract } from "./chat-workflow-permission-assertions.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const recordingRoot = join(repoRoot, "test-results", "electron-integration", "prod-record-chat");
const pageLoadTimeoutMs = 120_000;
const shutdownTimeoutMs = 10_000;

await main();

async function main() {
  await rm(recordingRoot, { force: true, recursive: true });
  await mkdir(recordingRoot, { recursive: true });
  const fixture = await createFixture("prod-record-chat");
  const recordingDir = join(recordingRoot, "session");

  try {
    await runProdRecordChatWorkflow(fixture, recordingDir);
  } finally {
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/conversations/list",
      "/chat/codex/permission/picker",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:open-codex-permission-picker",
    ],
  });
  process.stdout.write("Electron chat workflow passed: prod-record-chat\n");
}

async function runProdRecordChatWorkflow(fixture, recordingDir) {
  const context = await launchProdRecordContext(fixture, recordingDir);
  try {
    await exerciseProdRecordChat(context.client, fixture, recordingDir);
  } catch (error) {
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
    throw failureWithLogs(error, context.process.logs);
  } finally {
    context.client.close();
    await stopProcessGroup(context.process);
  }
}

async function exerciseProdRecordChat(client, fixture, recordingDir) {
  const backend = await backendProbe(recordingDir);
  const workspaceId = await openWorkspace(client, fixture.workspaceRoot, backend);
  const conversationId = await createChat(client, backend, workspaceId);
  await assertProdNewChatPermissionContract(backend, workspaceId, conversationId);
  await clickButtonByAria(client, "Open permission mode picker");
  await waitForTexts(client, ["Read Only", "Ask for approval", "Full Access"]);
  await assertTextAbsent(client, "ChatCodexEffectiveSettings.permission is required");
  await assertTextAbsent(client, "codexEffectiveSettings modelDisplayName is required");
  await captureScreenshot(client, join(recordingDir, "success.png"));
}

async function launchProdRecordContext(fixture, recordingDir) {
  await rm(recordingDir, { force: true, recursive: true });
  await mkdir(recordingDir, { recursive: true });
  const debugPort = await openPort();
  const child = spawn(
    join(repoRoot, "scripts", "prod_record_desktop_session.sh"),
    ["--build", `--remote-debugging-port=${debugPort}`],
    {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
        SETTA_APP_DATA_DIR: fixture.appDataDir,
        SETTA_BACKEND_READY_TIMEOUT_MS: "30000",
        SETTA_E2E: "1",
        SETTA_E2E_BLOCK_EXTERNAL_OPEN: "1",
        SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
        SETTA_E2E_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
        SETTA_RECORD_INCLUDE_PAYLOADS: "1",
        SETTA_RECORD_SCREENSHOT_INTERVAL_MS: "0",
        SETTA_RECORDING_DIR: recordingDir,
        SETTA_RECORDINGS_DIR: recordingRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.logs = [];
  child.stdout.on("data", (data) => appendLog(child.logs, data));
  child.stderr.on("data", (data) => appendLog(child.logs, data));
  try {
    const client = await connectToSettaPage(debugPort, child);
    await client.call("Runtime.enable");
    return { client, debugPort, process: child };
  } catch (error) {
    await stopProcessGroup(child);
    throw failureWithLogs(error, child.logs);
  }
}

async function assertProdNewChatPermissionContract(backend, workspaceId, conversationId) {
  const list = await backend.post("/chat/conversations/list", { workspaceId });
  const item = list.conversations.find((candidate) => candidate.conversation.id === conversationId);
  if (!item) {
    throw new Error(`created conversation ${conversationId} was not returned by list`);
  }
  const settings = item.conversation.codexEffectiveSettings;
  if (!settings?.modelDisplayName || !settings.reasoningEffortDisplayName) {
    throw new Error(
      `prod-record created conversation lacks effective display labels: ${JSON.stringify(
        settings,
      )}`,
    );
  }
  assertAskForApprovalPermissionContract(settings.permission, "prod-record created conversation");
}

async function openPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
  if (address === null || typeof address === "string") {
    throw new Error("failed to reserve Electron debugging port");
  }
  return address.port;
}

async function connectToSettaPage(debugPort, child) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < pageLoadTimeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`prod recording process exited before page load: ${child.logs.join("")}`);
    }
    try {
      const page = await settaPageTarget(debugPort);
      if (page) {
        return CDPClient.connect(page.webSocketDebuggerUrl, pageLoadTimeoutMs);
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Setta page target was not available: ${lastError?.message ?? "timed out"}`);
}

async function settaPageTarget(debugPort) {
  const response = await globalThis.fetch(`http://127.0.0.1:${debugPort}/json/list`);
  if (!response.ok) {
    throw new Error(`DevTools target list returned ${response.status}`);
  }
  const targets = await response.json();
  return targets.find((target) => target.type === "page" && target.title === "Setta") ?? null;
}

async function stopProcessGroup(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  const exitPromise = onceExit(child);
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  const exited = await Promise.race([
    exitPromise.then(() => true),
    delay(shutdownTimeoutMs).then(() => false),
  ]);
  if (!exited && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await Promise.race([exitPromise, delay(3_000)]);
  }
}

function onceExit(child) {
  return new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
}

function appendLog(logs, data) {
  logs.push(data.toString());
  if (logs.length > 200) {
    logs.shift();
  }
}
