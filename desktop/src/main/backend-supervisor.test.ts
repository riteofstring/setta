import { describe, expect, test, vi } from "vitest";
import { backendProtocolVersion } from "@generated/backend";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
        `{"event":"ready","addr":"127.0.0.1:41000","localPairingToken":"pairing_test","protocolVersion":${backendProtocolVersion}}`,
      ),
    ).toEqual({
      addr: "127.0.0.1:41000",
      event: "ready",
      localPairingToken: "pairing_test",
      protocolVersion: backendProtocolVersion,
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
        SETTA_BACKEND_PAIRING_TOKEN: "pairing_test",
        SETTA_BACKEND_URL: "http://100.64.0.12:7345",
      }),
    ).rejects.toThrow("SETTA_BACKEND_URL must point at a loopback host");
  });

  test("normalizes external backend URLs before appending API paths", async () => {
    const handle = await startBackend("/tmp/repo", "/tmp/app-data", {
      ...process.env,
      SETTA_BACKEND_PAIRING_TOKEN: "pairing_test",
      SETTA_BACKEND_URL: "http://127.0.0.1:7345/",
    });

    expect(handle.url).toBe("http://127.0.0.1:7345");
    expect(handle.localPairingToken).toBe("pairing_test");
    expect(handle.mode).toBe("external");
  });

  test("rejects external backend URLs with non-root path components", async () => {
    await expect(
      startBackend("/tmp/repo", "/tmp/app-data", {
        ...process.env,
        SETTA_BACKEND_PAIRING_TOKEN: "pairing_test",
        SETTA_BACKEND_URL: "http://127.0.0.1:7345/api",
      }),
    ).rejects.toThrow("SETTA_BACKEND_URL must not include a path, query, or fragment");
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
    expect(handle.localPairingToken).toBe("ready_with_logs_token");
    expect(handle.protocolVersion).toBe(backendProtocolVersion);
    expect(handle.recentLogs()).toContain("stderr log");
    expect(handle.recentLogs()).toContain("stdout log");
    expect(handle.recentLogs()).toContain(
      `{"event":"ready","addr":"127.0.0.1:41000","localPairingToken":"<redacted>","protocolVersion":${backendProtocolVersion}}`,
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

  test.runIf(process.platform !== "win32")(
    "falls back to signaling the child when process-group signaling is denied",
    async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "setta-backend-supervisor-"));
      const pidPath = join(tempDir, "pid");
      const readyForSignalPath = join(tempDir, "ready-for-signal");
      const markerPath = join(tempDir, "terminated");
      const originalKill = process.kill.bind(process);
      const killSpy = vi.spyOn(process, "kill").mockImplementation(((pid, signal) => {
        if (typeof pid === "number" && pid < 0) {
          const error = new Error("kill EPERM") as NodeJS.ErrnoException;
          error.code = "EPERM";
          throw error;
        }
        return originalKill(pid, signal);
      }) as typeof process.kill);
      let childPid: number | null = null;

      let cleanupError: unknown = null;
      try {
        const start = startSpawnedBackend({
          args: [backendSupervisorFixture("timeout-on-ready")],
          command: process.execPath,
          cwd: process.cwd(),
          env: {
            ...process.env,
            SETTA_BACKEND_SUPERVISOR_PID: pidPath,
            SETTA_BACKEND_SUPERVISOR_READY_FOR_SIGNAL: readyForSignalPath,
            SETTA_BACKEND_SUPERVISOR_TERMINATED: markerPath,
          },
          readyTimeoutMs: 2000,
        });
        void start.catch(() => {});
        await waitForFile(pidPath);
        childPid = Number.parseInt(readFileSync(pidPath, "utf8"), 10);

        await expect(start).rejects.toThrow("backend readiness timed out after 2000ms");
        expect(existsSync(markerPath)).toBe(true);
      } finally {
        killSpy.mockRestore();
        if (childPid !== null) {
          try {
            process.kill(childPid, "SIGTERM");
          } catch (error) {
            if (!isMissingProcessError(error)) {
              cleanupError = error;
            }
          }
        }
        rmSync(tempDir, { force: true, recursive: true });
      }
      if (cleanupError) {
        throw cleanupError;
      }
    },
  );

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

function isMissingProcessError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}
