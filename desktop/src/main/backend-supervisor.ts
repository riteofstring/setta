import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

export interface BackendReadyEvent {
  event: "ready";
  addr: string;
}

export interface BackendLaunchOptions {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  readyTimeoutMs: number;
}

interface BackendExit {
  code: number | null;
  expected: boolean;
  signal: NodeJS.Signals | null;
}

export interface BackendHandle {
  events: EventEmitter<{
    exit: [BackendExit];
    log: [string];
  }>;
  mode: "external" | "spawned";
  recentLogs: () => string[];
  stop: () => Promise<void>;
  url: string;
}

const maxRecentLogs = 80;
type BackendChild = ChildProcessByStdio<null, Readable, Readable>;

function resolveBackendLaunchOptions(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): BackendLaunchOptions {
  const readyTimeoutMs = positiveIntegerEnv(env.SETTA_BACKEND_READY_TIMEOUT_MS, 10_000);
  return {
    args: ["run", "./cmd/setta-backend"],
    command: `${repoRoot}/scripts/go.sh`,
    cwd: repoRoot,
    env: {
      ...env,
      SETTA_BACKEND_PORT: "0",
    },
    readyTimeoutMs,
  };
}

function externalBackendHandle(rawURL: string): BackendHandle {
  const url = validateExternalURL(rawURL);
  return {
    events: new EventEmitter(),
    mode: "external",
    recentLogs: () => [],
    stop: async () => {},
    url,
  };
}

export async function startSpawnedBackend(options: BackendLaunchOptions): Promise<BackendHandle> {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    detached: process.platform !== "win32",
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const events = new EventEmitter<{
    exit: [BackendExit];
    log: [string];
  }>();
  const logs: string[] = [];
  const lifecycle = monitorBackendProcess(child, events, logs);
  const ready = await waitForBackendReady(child, events, logs, options.readyTimeoutMs);

  return {
    events,
    mode: "spawned",
    recentLogs: () => [...logs],
    stop: () => stopBackend(child, lifecycle.markStopping, lifecycle.exitPromise),
    url: `http://${ready.addr}`,
  };
}

export async function startBackend(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<BackendHandle> {
  if (env.SETTA_BACKEND_URL) {
    return externalBackendHandle(env.SETTA_BACKEND_URL);
  }
  return startSpawnedBackend(resolveBackendLaunchOptions(repoRoot, env));
}

export function parseReadyLine(line: string): BackendReadyEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (value.event !== "ready" || typeof value.addr !== "string" || value.addr === "") {
    return null;
  }
  return { event: "ready", addr: value.addr };
}

function monitorBackendProcess(
  child: BackendChild,
  events: EventEmitter<{ exit: [BackendExit]; log: [string] }>,
  logs: string[],
) {
  let stopping = false;
  const markStopping = () => {
    stopping = true;
  };
  const exitPromise = new Promise<BackendExit>((resolve) => {
    child.once("exit", (code, signal) => {
      const exit = { code, expected: stopping, signal };
      events.emit("exit", exit);
      resolve(exit);
    });
  });

  collectLines(child.stderr, events, logs);
  return { exitPromise, markStopping };
}

function waitForBackendReady(
  child: BackendChild,
  events: EventEmitter<{ exit: [BackendExit]; log: [string] }>,
  logs: string[],
  readyTimeoutMs: number,
): Promise<BackendReadyEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`backend readiness timed out after ${readyTimeoutMs}ms`));
    }, readyTimeoutMs);

    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `backend exited before ready with code ${code ?? "null"} and signal ${signal ?? "null"}`,
        ),
      );
    });

    const stdout = createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
      appendLog(logs, line);
      events.emit("log", line);
      const ready = parseReadyLine(line);
      if (ready) {
        clearTimeout(timeout);
        stdout.close();
        resolve(ready);
      }
    });
  });
}

async function stopBackend(
  child: BackendChild,
  markStopping: () => void,
  exitPromise: Promise<BackendExit>,
): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  markStopping();
  signalBackendProcess(child, "SIGTERM");
  const exit = await Promise.race([exitPromise, delay(3_000).then(() => null)]);
  if (exit === null) {
    signalBackendProcess(child, "SIGKILL");
    await exitPromise;
  }
}

function signalBackendProcess(child: BackendChild, signal: NodeJS.Signals) {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (isMissingProcessError(error)) {
      return;
    }
    throw error;
  }
}

function isMissingProcessError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

function collectLines(
  stream: NodeJS.ReadableStream,
  events: EventEmitter<{ exit: [BackendExit]; log: [string] }>,
  logs: string[],
) {
  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    appendLog(logs, line);
    events.emit("log", line);
  });
}

function appendLog(logs: string[], line: string) {
  logs.push(line);
  if (logs.length > maxRecentLogs) {
    logs.shift();
  }
}

function positiveIntegerEnv(rawValue: string | undefined, fallback: number): number {
  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0 || String(value) !== rawValue) {
    throw new Error(`SETTA_BACKEND_READY_TIMEOUT_MS must be a positive integer: ${rawValue}`);
  }
  return value;
}

function validateExternalURL(rawURL: string): string {
  const url = new URL(rawURL);
  if (url.protocol !== "http:") {
    throw new Error(`SETTA_BACKEND_URL must use http: ${rawURL}`);
  }
  if (!isLoopbackHost(url.hostname)) {
    throw new Error(`SETTA_BACKEND_URL must point at a loopback host: ${rawURL}`);
  }
  return url.toString();
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
