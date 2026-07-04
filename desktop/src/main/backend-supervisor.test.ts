import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  parseReadyLine,
  startBackend,
  startSpawnedBackend,
  type BackendHandle,
} from "./backend-supervisor";

describe("parseReadyLine", () => {
  test("accepts the machine-readable ready event", () => {
    expect(
      parseReadyLine(
        '{"event":"ready","addr":"127.0.0.1:41000","bootstrapToken":"token_test","protocolVersion":1}',
      ),
    ).toEqual({
      addr: "127.0.0.1:41000",
      bootstrapToken: "token_test",
      event: "ready",
      protocolVersion: 1,
    });
  });

  test("ignores non-readiness logging", () => {
    expect(parseReadyLine("server log line")).toBeNull();
    expect(parseReadyLine('{"event":"log","addr":"127.0.0.1:41000"}')).toBeNull();
    expect(parseReadyLine('{"event":"ready","addr":"127.0.0.1:41000"}')).toBeNull();
  });
});

describe("startSpawnedBackend", () => {
  test("keeps SETTA_BACKEND_URL loopback-only", async () => {
    await expect(
      startBackend("/tmp/repo", "/tmp/app-data", {
        ...process.env,
        SETTA_BACKEND_TOKEN: "token_test",
        SETTA_BACKEND_URL: "http://100.64.0.12:7345",
      }),
    ).rejects.toThrow("SETTA_BACKEND_URL must point at a loopback host");
  });

  test("captures logs and stops a ready backend process", async () => {
    const handle = await startSpawnedBackend({
      args: [backendSupervisorFixture("ready-with-logs")],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      readyTimeoutMs: 3000,
    });

    expect(handle.mode).toBe("spawned");
    expect(handle.url).toBe("http://127.0.0.1:41000");
    expect(handle.bootstrapToken).toBe("ready_with_logs_token");
    expect(handle.protocolVersion).toBe(1);
    expect(handle.recentLogs()).toContain("stderr log");
    expect(handle.recentLogs()).toContain("stdout log");
    expect(handle.recentLogs()).toContain(
      '{"event":"ready","addr":"127.0.0.1:41000","bootstrapToken":"<redacted>","protocolVersion":1}',
    );

    await handle.stop();
  });

  test("continues capturing stdout after readiness", async () => {
    const handle = await startSpawnedBackend({
      args: [backendSupervisorFixture("post-ready-stdout")],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      readyTimeoutMs: 3000,
    });

    try {
      await waitForLog(handle, "post-ready stdout");
      expect(handle.recentLogs()).toContain("post-ready stdout");
    } finally {
      await handle.stop();
    }
  });

  test("stops the backend process when readiness times out", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "setta-backend-supervisor-"));
    const readyForSignalPath = join(tempDir, "ready-for-signal");
    const markerPath = join(tempDir, "terminated");

    try {
      const start = startSpawnedBackend({
        args: [backendSupervisorFixture("timeout-on-ready")],
        command: process.execPath,
        cwd: process.cwd(),
        env: {
          ...process.env,
          SETTA_BACKEND_SUPERVISOR_READY_FOR_SIGNAL: readyForSignalPath,
          SETTA_BACKEND_SUPERVISOR_TERMINATED: markerPath,
        },
        readyTimeoutMs: 2000,
      });
      void start.catch(() => {});
      await waitForFile(readyForSignalPath);
      await expect(start).rejects.toThrow("backend readiness timed out");
      expect(existsSync(readyForSignalPath)).toBe(true);
      expect(existsSync(markerPath)).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test("reports backend logs when the process exits before readiness", async () => {
    await expect(
      startSpawnedBackend({
        args: [backendSupervisorFixture("exit-before-ready")],
        command: process.execPath,
        cwd: process.cwd(),
        env: process.env,
        readyTimeoutMs: 3000,
      }),
    ).rejects.toThrow(
      [
        "backend exited before ready with code 1 and signal null",
        "Recent backend logs:",
        "start backend: load workspace session: malformed app state",
      ].join("\n"),
    );
  });

  test("reports unexpected exit after readiness", async () => {
    const handle = await startSpawnedBackend({
      args: [backendSupervisorFixture("exit-after-ready")],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      readyTimeoutMs: 3000,
    });

    const exit = await new Promise((resolve) => {
      handle.events.once("exit", resolve);
    });

    expect(exit).toEqual({ code: 12, expected: false, signal: null });
  });
});

function backendSupervisorFixture(name: string): string {
  return fileURLToPath(new URL(`./test-fixtures/backend-supervisor/${name}.mjs`, import.meta.url));
}

function waitForLog(handle: BackendHandle, expectedLine: string): Promise<void> {
  if (handle.recentLogs().includes(expectedLine)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      handle.events.off("log", onLog);
      reject(new Error(`timed out waiting for log line: ${expectedLine}`));
    }, 3000);

    const onLog = (line: string) => {
      if (line !== expectedLine) {
        return;
      }
      clearTimeout(timeout);
      handle.events.off("log", onLog);
      resolve();
    };

    handle.events.on("log", onLog);
  });
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      return;
    }
    await delay(10);
  }
  throw new Error(`timed out waiting for file: ${path}`);
}
