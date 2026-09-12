import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_START_TIMEOUT_MS = 15_000;
const DEFAULT_STOP_TIMEOUT_MS = 2_000;

function resolveHeadlessChromeBinary(explicitPath = null) {
  if (explicitPath !== null) {
    if (!path.isAbsolute(explicitPath)) {
      throw new Error("--chrome-binary must be an absolute path.");
    }
    if (!existsSync(explicitPath)) {
      throw new Error(`Chrome binary does not exist: ${explicitPath}.`);
    }
    return explicitPath;
  }
  if (process.platform !== "darwin") {
    throw new Error("Non-macOS headless inspection requires --chrome-binary.");
  }
  const defaultPath =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(defaultPath)) {
    throw new Error(`Default Chrome binary does not exist: ${defaultPath}.`);
  }
  return defaultPath;
}

export function startHeadlessChrome(explicitBinaryPath = null) {
  const profileDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-headless-chrome-"),
  );
  const child = spawn(
    resolveHeadlessChromeBinary(explicitBinaryPath),
    [
      "--headless=new",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-extensions",
      "--disable-renderer-backgrounding",
      "--no-default-browser-check",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const output = { stderr: "", stdout: "" };
  child.stderr.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`.slice(-8_000);
  });
  child.stdout.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`.slice(-8_000);
  });
  return { child, output, profileDirectory };
}

export async function waitForHeadlessChrome(
  browser,
  timeoutMs = DEFAULT_START_TIMEOUT_MS,
) {
  const portFile = path.join(browser.profileDirectory, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (browser.child.exitCode !== null) {
      throw new Error(
        `Headless Chrome exited with ${String(browser.child.exitCode)}.\n` +
          `${browser.output.stderr || browser.output.stdout}`,
      );
    }
    if (existsSync(portFile)) {
      const [rawPort] = readFileSync(portFile, "utf8").split("\n");
      const port = Number(rawPort);
      if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        throw new Error(
          `Headless Chrome wrote an invalid DevTools port: ${String(rawPort)}.`,
        );
      }
      return port;
    }
    await delay(50);
  }
  throw new Error(
    `Headless Chrome did not expose a DevTools port within ${String(timeoutMs)} ms.`,
  );
}

export async function stopHeadlessChrome(browser) {
  try {
    if (browser.child.exitCode === null) {
      const gracefulExit = once(browser.child, "exit");
      browser.child.kill("SIGTERM");
      const exitedGracefully = await Promise.race([
        gracefulExit.then(() => true),
        delay(DEFAULT_STOP_TIMEOUT_MS).then(() => false),
      ]);
      if (!exitedGracefully) {
        const forcedExit = once(browser.child, "exit");
        browser.child.kill("SIGKILL");
        const exitedForcibly = await Promise.race([
          forcedExit.then(() => true),
          delay(DEFAULT_STOP_TIMEOUT_MS).then(() => false),
        ]);
        if (!exitedForcibly) {
          throw new Error(
            `Headless Chrome process ${String(browser.child.pid)} did not terminate.`,
          );
        }
      }
    }
  } finally {
    rmSync(browser.profileDirectory, { force: true, recursive: true });
  }
}
