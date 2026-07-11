import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { CDPClient } from "./cdp-client.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const connectTimeoutMs = 30_000;

export async function launchWebPWACdpContext({ targetURL, visible = false }) {
  const debugPort = await reservePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "setta-web-pwa-browser-"));
  const child = spawn(
    electronBin(),
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      join(scriptDir, "web-pwa-browser-app"),
    ],
    {
      cwd: desktopRoot,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
        SETTA_E2E_VISIBLE: visible ? "1" : "0",
        SETTA_E2E_WEB_PWA_URL: targetURL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.logs = [];
  child.stdout.on("data", (data) => child.logs.push(data.toString()));
  child.stderr.on("data", (data) => child.logs.push(data.toString()));
  let client;
  try {
    client = await connectToTarget(debugPort, new URL(targetURL).hostname);
  } catch (error) {
    await stopChild(child);
    await rm(userDataDir, { force: true, recursive: true });
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n${child.logs.join("")}`,
      {
        cause: error,
      },
    );
  }
  const pageErrors = capturePageErrors(client);
  await client.call("Runtime.enable");
  await client.call("Page.enable");
  return { child, client, debugPort, pageErrors, userDataDir };
}

export async function stopWebPWACdpContext(context, outputPath) {
  if (!context) {
    return;
  }
  context.client.close();
  await stopChild(context.child);
  await writeFile(outputPath, context.child.logs.join(""));
  await rm(context.userDataDir, { force: true, recursive: true });
}

async function connectToTarget(debugPort, hostname) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < connectTimeoutMs) {
    try {
      const response = await globalThis.fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find(
        (target) => target.type === "page" && new URL(target.url).hostname === hostname,
      );
      if (page) {
        return CDPClient.connect(page.webSocketDebuggerUrl, connectTimeoutMs);
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`PWA page target was not available: ${lastError?.message ?? "timed out"}`);
}

async function reservePort() {
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
    throw new Error("failed to reserve PWA debugging port");
  }
  return address.port;
}

async function stopChild(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  const exit = new Promise((resolvePromise) => child.once("exit", resolvePromise));
  child.kill("SIGTERM");
  const stopped = await Promise.race([exit.then(() => true), delay(10_000).then(() => false)]);
  if (!stopped && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exit, delay(3_000)]);
  }
}

function electronBin() {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return join(desktopRoot, "node_modules", ".bin", `electron${extension}`);
}

function capturePageErrors(client) {
  const errors = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    errors.push({
      message:
        exceptionDetails?.exception?.description ??
        exceptionDetails?.exception?.value ??
        exceptionDetails?.text ??
        "unknown page exception",
      type: "exception",
    });
  });
  client.on("Runtime.consoleAPICalled", ({ args = [], type }) => {
    if (type !== "error" && type !== "assert") {
      return;
    }
    errors.push({
      message: args
        .map((argument) => argument.value ?? argument.description ?? argument.type ?? "unknown")
        .join(" "),
      type: `console.${type}`,
    });
  });
  return errors;
}
