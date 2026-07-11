import { spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { clearTimeout, setTimeout as startTimer } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

const externalBackendReadyTimeoutMs = 20_000;
const externalBackendStopTimeoutMs = 5_000;

export async function startExternalScriptedBackend(fixture, repoRoot, options = {}) {
  const args = [
    "run",
    "./cmd/setta-backend",
    "--app-data-dir",
    fixture.appDataDir,
    "--port",
    String(options.port ?? 0),
  ];
  if (options.skipBootstrapDeviceSession) {
    args.push("--skip-bootstrap-device-session");
  }
  const child = spawn(join(repoRoot, "scripts", "go.sh"), args, {
    cwd: repoRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      SETTA_E2E: "1",
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  const ready = await waitForExternalBackendReady(child, logs, {
    requireBootstrapToken: !options.skipBootstrapDeviceSession,
  });
  return { child, logs, token: ready.bootstrapToken, url: `http://${ready.addr}` };
}

function waitForExternalBackendReady(child, logs, options) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const timeout = startTimer(
      () => finish(new Error("external backend readiness timed out")),
      externalBackendReadyTimeoutMs,
    );
    const stdout = createInterface({ input: child.stdout });
    const stderr = createInterface({ input: child.stderr });

    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      finish(new Error(`external backend exited before ready: code=${code} signal=${signal}`));
    });
    stdout.on("line", (line) => {
      appendExternalBackendLog(logs, line);
      const ready = parseExternalBackendReadyLine(line, options);
      if (ready) {
        finish(ready);
      }
    });
    stderr.on("line", (line) => appendExternalBackendLog(logs, line));

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (result instanceof Error) {
        reject(errorWithExternalBackendLogs(result, logs));
        return;
      }
      resolvePromise(result);
    }
  });
}

function parseExternalBackendReadyLine(line, options) {
  const value = parseExternalBackendReadyJSON(line);
  return isExternalBackendReadyRecord(value, options) ? value : null;
}

function parseExternalBackendReadyJSON(line) {
  try {
    const value = JSON.parse(line);
    return value !== null && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function isExternalBackendReadyRecord(value, options) {
  return (
    value !== null &&
    value.event === "ready" &&
    nonEmptyString(value.addr) &&
    validBootstrapToken(value.bootstrapToken, options.requireBootstrapToken)
  );
}

function validBootstrapToken(value, required) {
  return typeof value === "string" && (!required || value !== "");
}

function nonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

export async function killExternalBackend(handle) {
  await stopExternalBackend(handle, { force: true });
}

export async function stopExternalBackend(handle, { force = false } = {}) {
  if (!handle || handle.child.exitCode !== null || handle.child.killed) {
    return;
  }
  const exitPromise = new Promise((resolvePromise) => {
    handle.child.once("exit", resolvePromise);
  });
  signalExternalBackendProcess(handle.child, force ? "SIGKILL" : "SIGTERM");
  const exited = await Promise.race([
    exitPromise.then(() => true),
    delay(externalBackendStopTimeoutMs).then(() => false),
  ]);
  if (!exited && handle.child.exitCode === null) {
    signalExternalBackendProcess(handle.child, "SIGKILL");
    await Promise.race([exitPromise, delay(externalBackendStopTimeoutMs)]);
  }
}

function signalExternalBackendProcess(child, signal) {
  if (child.pid === undefined) {
    return false;
  }
  if (process.platform === "win32") {
    child.kill(signal);
    return true;
  }
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

function appendExternalBackendLog(logs, line) {
  logs.push(line + "\n");
  if (logs.length > 100) {
    logs.shift();
  }
}

function errorWithExternalBackendLogs(error, logs) {
  if (logs.length === 0) {
    return error;
  }
  return new Error(`${error.message}\nExternal backend output:\n${logs.join("")}`);
}
