import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

export interface BackendReadyEvent {
  event: "ready";
  addr: string;
  bootstrapToken: string;
  protocolVersion: number;
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

type BackendEvents = EventEmitter<{
  exit: [BackendExit];
  log: [string];
}>;

type BackendStdoutEvents = EventEmitter<{
  line: [string];
}>;

export interface BackendHandle {
  bootstrapToken: string;
  events: BackendEvents;
  mode: "external" | "spawned";
  protocolVersion: number;
  recentLogs: () => string[];
  stop: () => Promise<void>;
  url: string;
}

const maxRecentLogs = 80;
const defaultSpawnedBackendReadyTimeoutMs = 120_000;
type BackendChild = ChildProcessByStdio<null, Readable, Readable>;

function resolveBackendLaunchOptions(
  repoRoot: string,
  appDataDir: string,
  env: NodeJS.ProcessEnv,
): BackendLaunchOptions {
  const readyTimeoutMs = positiveIntegerEnv(
    env.SETTA_BACKEND_READY_TIMEOUT_MS,
    defaultSpawnedBackendReadyTimeoutMs,
  );
  return {
    args: ["run", "./cmd/setta-backend", "--app-data-dir", appDataDir],
    command: `${repoRoot}/scripts/go.sh`,
    cwd: repoRoot,
    env: {
      ...env,
      SETTA_BACKEND_PORT: "0",
    },
    readyTimeoutMs,
  };
}

function externalBackendHandle(rawURL: string, bootstrapToken: string | undefined): BackendHandle {
  const url = validateExternalURL(rawURL);
  if (!bootstrapToken) {
    throw new Error("SETTA_BACKEND_URL requires SETTA_BACKEND_TOKEN");
  }
  return {
    bootstrapToken,
    events: new EventEmitter(),
    mode: "external",
    protocolVersion: 0,
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
  const events: BackendEvents = new EventEmitter();
  const stdoutEvents: BackendStdoutEvents = new EventEmitter();
  const logs: string[] = [];
  const readyPromise = waitForBackendReady(child, stdoutEvents, options.readyTimeoutMs);
  const lifecycle = monitorBackendProcess(child, events, stdoutEvents, logs);
  let ready: BackendReadyEvent;

  try {
    ready = await readyPromise;
  } catch (error) {
    try {
      await stopBackend(child, lifecycle.markStopping, lifecycle.exitPromise);
    } catch (cleanupError) {
      appendLog(
        logs,
        `backend cleanup after startup failure failed: ${errorMessage(cleanupError)}`,
      );
    }
    throw startupErrorWithLogs(error, logs);
  }

  return {
    bootstrapToken: ready.bootstrapToken,
    events,
    mode: "spawned",
    protocolVersion: ready.protocolVersion,
    recentLogs: () => [...logs],
    stop: () => stopBackend(child, lifecycle.markStopping, lifecycle.exitPromise),
    url: `http://${ready.addr}`,
  };
}

export async function startBackend(
  repoRoot: string,
  appDataDir: string,
  env: NodeJS.ProcessEnv,
): Promise<BackendHandle> {
  if (env.SETTA_BACKEND_URL) {
    return externalBackendHandle(env.SETTA_BACKEND_URL, env.SETTA_BACKEND_TOKEN);
  }
  return startSpawnedBackend(resolveBackendLaunchOptions(repoRoot, appDataDir, env));
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
  return parseReadyRecord(value);
}

function parseReadyRecord(value: Record<string, unknown>): BackendReadyEvent | null {
  if (value.event !== "ready") {
    return null;
  }
  const addr = readNonEmptyString(value.addr);
  const bootstrapToken = readNonEmptyString(value.bootstrapToken);
  const protocolVersion = readPositiveInteger(value.protocolVersion);
  if (addr === null || bootstrapToken === null || protocolVersion === null) {
    return null;
  }
  return {
    addr,
    bootstrapToken,
    event: "ready",
    protocolVersion,
  };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function monitorBackendProcess(
  child: BackendChild,
  events: BackendEvents,
  stdoutEvents: BackendStdoutEvents,
  logs: string[],
) {
  let stopping = false;
  const markStopping = () => {
    stopping = true;
  };
  const exitPromise = new Promise<BackendExit>((resolve) => {
    child.once("close", (code, signal) => {
      const exit = { code, expected: stopping, signal };
      events.emit("exit", exit);
      resolve(exit);
    });
  });

  collectLines(child.stdout, events, logs, (line) => {
    stdoutEvents.emit("line", line);
  });
  collectLines(child.stderr, events, logs);
  return { exitPromise, markStopping };
}

function waitForBackendReady(
  child: BackendChild,
  stdoutEvents: BackendStdoutEvents,
  readyTimeoutMs: number,
): Promise<BackendReadyEvent> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error(`backend readiness timed out after ${readyTimeoutMs}ms`)),
      readyTimeoutMs,
    );
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(
        new Error(
          `backend exited before ready with code ${code ?? "null"} and signal ${signal ?? "null"}`,
        ),
      );
    };
    const onError = (error: Error) => {
      finish(new Error(`backend process failed before ready: ${error.message}`));
    };
    const onLine = (line: string) => {
      const ready = parseReadyLine(line);
      if (ready) {
        finish(ready);
      }
    };

    child.once("close", onExit);
    child.once("error", onError);
    stdoutEvents.on("line", onLine);

    function finish(result: BackendReadyEvent | Error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.off("close", onExit);
      child.off("error", onError);
      stdoutEvents.off("line", onLine);
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    }
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
    if (signalBackendProcess(child, "SIGKILL")) {
      await Promise.race([exitPromise, delay(3_000)]);
    }
  }
}

function signalBackendProcess(child: BackendChild, signal: NodeJS.Signals): boolean {
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
    if (isMissingProcessError(error)) {
      return false;
    }
    if (isPermissionError(error)) {
      return signalChildProcess(child, signal);
    }
    throw error;
  }
}

function isMissingProcessError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

function isPermissionError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EPERM";
}

function signalChildProcess(child: BackendChild, signal: NodeJS.Signals): boolean {
  try {
    return child.kill(signal);
  } catch (error) {
    if (isMissingProcessError(error)) {
      return false;
    }
    throw error;
  }
}

function collectLines(
  stream: NodeJS.ReadableStream,
  events: BackendEvents,
  logs: string[],
  onLine?: (line: string) => void,
) {
  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    const logLine = sanitizeBackendLogLine(line);
    appendLog(logs, logLine);
    events.emit("log", logLine);
    onLine?.(line);
  });
}

function sanitizeBackendLogLine(line: string): string {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return line;
  }
  if (!isRecord(value) || typeof value.bootstrapToken !== "string") {
    return line;
  }
  return JSON.stringify({ ...value, bootstrapToken: "<redacted>" });
}

function appendLog(logs: string[], line: string) {
  logs.push(line);
  if (logs.length > maxRecentLogs) {
    logs.shift();
  }
}

function startupErrorWithLogs(error: unknown, logs: string[]): Error {
  const message = errorMessage(error);
  if (logs.length === 0) {
    return new Error(message);
  }
  return new Error(`${message}\nRecent backend logs:\n${logs.join("\n")}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "backend failed before ready";
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
  if ((url.pathname !== "" && url.pathname !== "/") || url.search !== "" || url.hash !== "") {
    throw new Error(`SETTA_BACKEND_URL must not include a path, query, or fragment: ${rawURL}`);
  }
  return `${url.protocol}//${url.host}`;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
